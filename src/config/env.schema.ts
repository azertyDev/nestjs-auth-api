import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().url(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    JWT_ISSUER: z.string().default('auth-api'),
    JWT_AUDIENCE: z.string().default('auth-api-clients'),

    THROTTLE_TTL: z.coerce.number().int().positive().default(60),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    JWT_CLOCK_TOLERANCE_SEC: z.coerce.number().int().min(0).max(120).default(30),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    ENABLE_SWAGGER: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    ADMIN_EMAIL: z.string().min(3).optional(),
    ADMIN_PASSWORD: z.string().min(8).max(128).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
    const emailSet = Boolean(data.ADMIN_EMAIL);
    const passwordSet = Boolean(data.ADMIN_PASSWORD);
    if (emailSet !== passwordSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ADMIN_EMAIL and ADMIN_PASSWORD must be set together',
        path: [emailSet ? 'ADMIN_PASSWORD' : 'ADMIN_EMAIL'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const formatted = parsed.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return parsed.data;
};
