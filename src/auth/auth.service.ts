import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import type { RequestMeta, TokenPair } from './types/jwt-payload.type';

const ARGON_OPTS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async register(email: string, password: string, meta: RequestMeta): Promise<TokenPair> {
    const passwordHash = await argon2.hash(password, ARGON_OPTS);
    const user = await this.users.create({ email, passwordHash, role: Role.USER });
    this.logger.log({ event: 'user.registered', userId: user.id });
    return this.issuePair(user.id, user.email, user.role, randomUUID(), meta);
  }

  async login(email: string, password: string, meta: RequestMeta): Promise<TokenPair> {
    const user = await this.users.findByEmail(email);
    const dummyHash =
      '$argon2id$v=19$m=19456,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$AAAAAAAAAAAAAAAAAAAAAA';
    const valid = user
      ? await argon2.verify(user.passwordHash, password).catch(() => false)
      : await argon2.verify(dummyHash, password).catch(() => false);

    if (!user || !valid) {
      this.logger.warn({ event: 'auth.login.failed' });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log({ event: 'auth.login.success', userId: user.id });
    return this.issuePair(user.id, user.email, user.role, randomUUID(), meta);
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<TokenPair> {
    const payload = this.tokens.verifyRefresh(rawToken);
    const tokenHash = this.tokens.hashToken(payload.jti);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      this.logger.error({
        event: 'auth.refresh.unknown_token',
        userId: payload.sub,
        family: payload.family,
      });
      await this.revokeFamily(payload.sub, payload.family);
      throw new ForbiddenException('Token theft detected');
    }

    if (stored.revokedAt) {
      this.logger.error({
        event: 'auth.refresh.reuse_detected',
        userId: payload.sub,
        family: payload.family,
        tokenId: stored.id,
      });
      await this.revokeFamily(stored.userId, stored.family);
      throw new ForbiddenException('Token reuse detected — all sessions revoked');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.users.findById(stored.userId);

    const next = this.tokens.signRefresh({ sub: user.id, family: stored.family });
    const nextHash = this.tokens.hashToken(next.jti);
    const nextExpiresAt = new Date(Date.now() + next.expiresIn * 1000);

    await this.prisma.$transaction(async (tx) => {
      const revoke = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedBy: nextHash },
      });
      if (revoke.count !== 1) {
        // Lost the race; another concurrent refresh already rotated.
        throw new ForbiddenException('Concurrent refresh detected');
      }
      await tx.refreshToken.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash: nextHash,
          family: stored.family,
          expiresAt: nextExpiresAt,
          userAgent: meta.userAgent ?? null,
          ip: meta.ip ?? null,
        },
      });
    });

    const access = this.tokens.signAccess({ sub: user.id, email: user.email, role: user.role });

    return {
      accessToken: access.token,
      refreshToken: next.token,
      accessExpiresIn: access.expiresIn,
      refreshExpiresIn: next.expiresIn,
    };
  }

  async logout(userId: string, refreshTokenRaw: string): Promise<void> {
    let payload: ReturnType<TokenService['verifyRefresh']>;
    try {
      payload = this.tokens.verifyRefresh(refreshTokenRaw);
    } catch {
      this.logger.warn({ event: 'auth.logout.invalid_token', userId });
      return;
    }
    if (payload.sub !== userId) {
      throw new ForbiddenException('Token does not belong to user');
    }
    const tokenHash = this.tokens.hashToken(payload.jti);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log({ event: 'auth.logout', userId });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log({ event: 'auth.logout_all', userId });
  }

  private async issuePair(
    userId: string,
    email: string,
    role: Role,
    family: string,
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const access = this.tokens.signAccess({ sub: userId, email, role });
    const refresh = this.tokens.signRefresh({ sub: userId, family });
    const tokenHash = this.tokens.hashToken(refresh.jti);
    const expiresAt = new Date(Date.now() + refresh.expiresIn * 1000);

    await this.prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        userId,
        tokenHash,
        family,
        expiresAt,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessExpiresIn: access.expiresIn,
      refreshExpiresIn: refresh.expiresIn,
    };
  }

  private async revokeFamily(userId: string, family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
