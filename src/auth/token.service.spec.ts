import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'a'.repeat(48),
              JWT_REFRESH_SECRET: 'b'.repeat(48),
              JWT_ACCESS_TTL: '15m',
              JWT_REFRESH_TTL: '7d',
              JWT_ISSUER: 'test-iss',
              JWT_AUDIENCE: 'test-aud',
            }),
          ],
        }),
        JwtModule.register({}),
      ],
      providers: [TokenService],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('signs and verifies refresh token', () => {
    const { token, jti } = service.signRefresh({ sub: 'user-1', family: 'fam-1' });
    expect(token).toBeTruthy();
    expect(jti).toBeTruthy();
    const payload = service.verifyRefresh(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.family).toBe('fam-1');
    expect(payload.jti).toBe(jti);
  });

  it('signs distinct access tokens with unique jti', () => {
    const a = service.signAccess({ sub: 'u', email: 'e@x.io', role: 'USER' as never });
    const b = service.signAccess({ sub: 'u', email: 'e@x.io', role: 'USER' as never });
    expect(a.jti).not.toBe(b.jti);
  });

  it('hashes consistently', () => {
    expect(service.hashToken('abc')).toBe(service.hashToken('abc'));
    expect(service.hashToken('abc')).not.toBe(service.hashToken('xyz'));
  });

  it('rejects refresh signed with access secret', () => {
    const access = service.signAccess({ sub: 'u', email: 'e@x.io', role: 'USER' as never });
    expect(() => service.verifyRefresh(access.token)).toThrow();
  });
});
