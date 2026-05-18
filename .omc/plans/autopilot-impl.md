# Plan: NestJS Auth API Implementation

## Phase 2 Task Breakdown

### T1 — Project Scaffold (Sonnet)
- `package.json` with Nest 10, Prisma, Passport, JWT, argon2, throttler, helmet, pino, zod, class-validator, class-transformer
- `tsconfig.json` (strict, target ES2022, decorators)
- `nest-cli.json`
- `.eslintrc.js`, `.prettierrc`
- `.gitignore`, `.dockerignore`
- `.env.example`
- **Verify**: file structure exists

### T2 — Env Config Module (Sonnet)
- `src/config/env.schema.ts` — Zod schema
- `src/config/config.module.ts` — NestJS ConfigModule wrapper, validates on boot
- Required vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `CORS_ORIGINS`, `NODE_ENV`, `PORT`, `THROTTLE_TTL`, `THROTTLE_LIMIT`
- **Verify**: boot fails on missing/invalid env

### T3 — Prisma Schema + Migration (Sonnet)
- `prisma/schema.prisma`: User, RefreshToken models
- Indexes on email, tokenHash, userId+family
- `prisma/migrations/` initial migration
- `src/prisma/prisma.module.ts`, `prisma.service.ts` (lifecycle hooks)
- **Verify**: `npx prisma validate` passes

### T4 — Users Module (Sonnet)
- `src/users/dto/create-user.dto.ts`, `update-user.dto.ts`
- `src/users/users.service.ts` — create, findByEmail, findById
- `src/users/users.controller.ts` — `GET /users/:id` (guarded)
- `src/users/users.module.ts`
- **Verify**: unit tests for service

### T5 — Auth Core (Opus)
- `src/auth/dto/register.dto.ts`, `login.dto.ts`, `refresh.dto.ts`
- `src/auth/auth.service.ts`:
  - `register(dto)` → hash, create user, issue pair
  - `login(email, pwd)` → validate, issue pair
  - `refresh(token, meta)` → verify, detect reuse, rotate, issue new pair
  - `logout(userId, jti)` → revoke single
  - `logoutAll(userId)` → revoke all family
- `src/auth/token.service.ts`:
  - `signAccess(payload)`, `signRefresh(payload)`
  - `verifyAccess`, `verifyRefresh`
  - `hashRefresh(jti)` sha256
- `src/auth/auth.controller.ts` — all endpoints
- `src/auth/strategies/jwt-access.strategy.ts` — passport-jwt access
- `src/auth/strategies/jwt-refresh.strategy.ts` — passport-jwt refresh (bearer)
- `src/auth/guards/jwt-access.guard.ts`, `jwt-refresh.guard.ts`
- `src/auth/decorators/current-user.decorator.ts`, `public.decorator.ts`, `roles.decorator.ts`
- `src/auth/guards/roles.guard.ts`
- `src/auth/auth.module.ts`
- **Verify**: unit tests for token rotation, reuse detection

### T6 — App Shell + Security Middleware (Sonnet)
- `src/app.module.ts` — wire all modules, `ThrottlerModule.forRoot`
- `src/main.ts`:
  - `helmet()`
  - global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})`
  - CORS from env
  - global exception filter
  - pino logger
  - Swagger setup (gated by `ENABLE_SWAGGER`)
- `src/common/filters/all-exceptions.filter.ts`
- `src/common/interceptors/logging.interceptor.ts`
- `src/health/health.controller.ts` — db ping
- **Verify**: server boots, hits `/health`

### T7 — Rate Limit Overrides (Sonnet)
- `@Throttle` decorator on `/auth/login` (5/min), `/auth/register` (5/min), `/auth/refresh` (10/min)
- **Verify**: integration test hits limit

### T8 — Tests (Sonnet)
- Unit: `auth.service.spec.ts`, `token.service.spec.ts`, `users.service.spec.ts`
- E2E: `test/auth.e2e-spec.ts` — full flow: register → login → me → refresh → logout, reuse detection, rate limit
- Mock Prisma via `jest-mock-extended`
- **Verify**: `npm test` green, coverage ≥ 80% on auth

### T9 — Docker + README (Sonnet)
- `Dockerfile` multi-stage (build → prod, non-root user)
- `docker-compose.yml` (api + postgres + healthchecks)
- `.dockerignore`
- `README.md`: setup, env, run, test, security notes, endpoint table

### T10 — Codex 5.5 Cross-Review (Phase 4)
- Use `oh-my-claudecode:ask` skill with codex backend for second-opinion review of auth.service + token.service security

## Dependencies
- T1 → T2, T3
- T2, T3 → T4
- T2, T3, T4 → T5
- T5 → T6
- T6 → T7
- T5, T6 → T8
- All code → T9
- T8 → T10

## Parallelization
- T2 ∥ T3 (after T1)
- T4 ∥ (start of) T5 token strategies
- T9 ∥ T8 (after T6)
