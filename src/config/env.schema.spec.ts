import { validateEnv } from './env.schema';

describe('env validation', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    THROTTLE_TTL: '60',
    THROTTLE_LIMIT: '100',
    CORS_ORIGINS: 'http://localhost:3000',
  };

  it('passes with valid env', () => {
    const env = validateEnv(base);
    expect(env.DATABASE_URL).toBe(base.DATABASE_URL);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('rejects identical access and refresh secrets', () => {
    expect(() => validateEnv({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('rejects short secrets', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });

  it('rejects bad DATABASE_URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
