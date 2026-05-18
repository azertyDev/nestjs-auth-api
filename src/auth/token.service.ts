import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import type { AccessTokenPayload, RefreshTokenPayload } from './types/jwt-payload.type';
import type { Env } from '../config/env.schema';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccess(payload: Omit<AccessTokenPayload, 'jti' | 'iat' | 'exp' | 'iss' | 'aud'>): {
    token: string;
    jti: string;
    expiresIn: number;
  } {
    const jti = randomUUID();
    const token = this.jwt.sign(
      { ...payload, jti },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      },
    );
    const decoded = this.jwt.decode(token) as AccessTokenPayload;
    return {
      token,
      jti,
      expiresIn: (() => {
        if (!decoded?.exp) throw new Error('JWT missing exp claim');
        return decoded.exp - Math.floor(Date.now() / 1000);
      })(),
    };
  }

  signRefresh(payload: Omit<RefreshTokenPayload, 'jti' | 'iat' | 'exp' | 'iss' | 'aud'>): {
    token: string;
    jti: string;
    expiresIn: number;
  } {
    const jti = randomUUID();
    const token = this.jwt.sign(
      { ...payload, jti },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        audience: this.config.get('JWT_AUDIENCE', { infer: true }),
      },
    );
    const decoded = this.jwt.decode(token) as RefreshTokenPayload;
    return {
      token,
      jti,
      expiresIn: (() => {
        if (!decoded?.exp) throw new Error('JWT missing exp claim');
        return decoded.exp - Math.floor(Date.now() / 1000);
      })(),
    };
  }

  verifyRefresh(token: string): RefreshTokenPayload {
    try {
      return this.jwt.verify<RefreshTokenPayload>(token, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        issuer: this.config.get('JWT_ISSUER', { infer: true }),
        audience: this.config.get('JWT_AUDIENCE', { infer: true }),
        algorithms: ['HS256'],
        clockTolerance: this.config.get('JWT_CLOCK_TOLERANCE_SEC', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  hashToken(jti: string): string {
    return createHash('sha256').update(jti).digest('hex');
  }
}
