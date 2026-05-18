import { Test } from '@nestjs/testing';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let users: MockProxy<UsersService>;
  let tokens: MockProxy<TokenService>;
  let prisma: MockProxy<PrismaService>;

  beforeEach(async () => {
    users = mockDeep<UsersService>();
    tokens = mockDeep<TokenService>();
    prisma = mockDeep<PrismaService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: TokenService, useValue: tokens },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(AuthService);

    tokens.signAccess.mockReturnValue({ token: 'access', jti: 'a-jti', expiresIn: 900 });
    tokens.signRefresh.mockReturnValue({ token: 'refresh', jti: 'r-jti', expiresIn: 604800 });
    tokens.hashToken.mockImplementation((s) => `h(${s})`);
  });

  describe('refresh', () => {
    const validPayload = { sub: 'u1', jti: 'r-jti', family: 'fam-1' };

    it('throws and revokes family when token unknown', async () => {
      tokens.verifyRefresh.mockReturnValue(validPayload);
      (prisma.refreshToken.findUnique as unknown as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh('t', {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.refreshToken.updateMany as unknown as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', family: 'fam-1', revokedAt: null },
        }),
      );
    });

    it('detects reuse and revokes family when token already revoked', async () => {
      tokens.verifyRefresh.mockReturnValue(validPayload);
      (prisma.refreshToken.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 't1',
        userId: 'u1',
        tokenHash: 'h(r-jti)',
        family: 'fam-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        replacedBy: null,
        userAgent: null,
        ip: null,
        createdAt: new Date(),
      });

      await expect(service.refresh('t', {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rotates token on success', async () => {
      tokens.verifyRefresh.mockReturnValue(validPayload);
      (prisma.refreshToken.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 't1',
        userId: 'u1',
        tokenHash: 'h(r-jti)',
        family: 'fam-1',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedBy: null,
        userAgent: null,
        ip: null,
        createdAt: new Date(),
      });
      (users.findById as unknown as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'e@x.io',
        passwordHash: 'h',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (prisma.$transaction as unknown as jest.Mock).mockResolvedValue([{}, {}] as never);

      const result = await service.refresh('t', { ip: '127.0.0.1' });
      expect(result.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
      expect(prisma.$transaction as unknown as jest.Mock).toHaveBeenCalled();
    });

    it('rejects expired token', async () => {
      tokens.verifyRefresh.mockReturnValue(validPayload);
      (prisma.refreshToken.findUnique as unknown as jest.Mock).mockResolvedValue({
        id: 't1',
        userId: 'u1',
        tokenHash: 'h(r-jti)',
        family: 'fam-1',
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: null,
        replacedBy: null,
        userAgent: null,
        ip: null,
        createdAt: new Date(),
      });
      (users.findById as unknown as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'e@x.io',
        passwordHash: 'h',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.refresh('t', {})).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('rejects unknown email with same exception as wrong password', async () => {
      (users.findByEmail as unknown as jest.Mock).mockResolvedValue(null);
      await expect(service.login('nope@x.io', 'whatever', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
