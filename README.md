# NestJS Auth API

Production-grade user authentication REST API built with NestJS, Prisma, PostgreSQL, and JWT access + refresh token rotation. Designed with OWASP-aligned security defaults.

## Features

- Email + password registration with **argon2id** hashing (memCost ~19MB)
- **JWT access tokens** (HS256, short TTL — 15 min) + **JWT refresh tokens** (long TTL — 7 days)
- **Refresh token rotation** with **theft / reuse detection** — replayed refresh revokes the entire token family
- Hashed refresh tokens stored at rest (sha256 of `jti`)
- Role-based access (USER / ADMIN)
- Global `ValidationPipe` with whitelisting + DTO validation
- `helmet`, CORS allow-list from env, `trust proxy` for X-Forwarded-*
- `@nestjs/throttler` global rate limit + stricter limits on `/auth/login`, `/auth/register`, `/auth/refresh`
- Zod-validated environment at boot — fail-fast on missing/invalid env
- Structured logging via `pino` with secret redaction
- Generic auth errors (no user enumeration)
- Health check (`/health`) with DB probe
- OpenAPI/Swagger at `/api/docs` (env-gated)
- Multi-stage hardened Dockerfile + docker-compose

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST   | `/auth/register` | public | Create user, return tokens |
| POST   | `/auth/login`    | public | Verify creds, return tokens |
| POST   | `/auth/refresh`  | refresh JWT (body) | Rotate refresh, return new pair |
| POST   | `/auth/logout`   | access JWT | Revoke current refresh |
| POST   | `/auth/logout-all` | access JWT | Revoke all refresh tokens |
| GET    | `/auth/me`       | access JWT | Current user |
| GET    | `/users/:id`     | access JWT | Self or admin |
| GET    | `/health`        | public | Liveness/readiness |

## Setup

```bash
cp .env.example .env
# fill JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (>= 32 chars each, different)
#   openssl rand -base64 64
npm install
npx prisma migrate dev --name init
npm run start:dev
```

Swagger: http://localhost:3000/api/docs

## Run with Docker

```bash
export JWT_ACCESS_SECRET=$(openssl rand -base64 64)
export JWT_REFRESH_SECRET=$(openssl rand -base64 64)
docker compose up --build
```

## Test

```bash
npm run lint
npm test
npm run test:cov
```

## Environment Variables

See `.env.example`. All vars are validated by Zod (`src/config/env.schema.ts`) — boot fails on missing/invalid.

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | min 32 chars |
| `JWT_REFRESH_SECRET` | yes | min 32 chars, MUST differ from access |
| `JWT_ACCESS_TTL` | no | default `15m` |
| `JWT_REFRESH_TTL` | no | default `7d` |
| `JWT_ISSUER` | no | default `auth-api` |
| `JWT_AUDIENCE` | no | default `auth-api-clients` |
| `THROTTLE_TTL` | no | seconds, default 60 |
| `THROTTLE_LIMIT` | no | requests per TTL, default 100 |
| `CORS_ORIGINS` | no | comma-separated list |
| `ENABLE_SWAGGER` | no | `true`/`false` |
| `LOG_LEVEL` | no | pino level |

## Security Notes

- **Always serve over HTTPS** in production; the app sets `trust proxy` for X-Forwarded-* headers — make sure the reverse proxy is trusted.
- Set Swagger `ENABLE_SWAGGER=false` in production unless gated behind auth/VPN.
- Rotate JWT secrets if leak suspected: in-flight access tokens remain valid until expiry (max `JWT_ACCESS_TTL`). To kill all sessions instantly, also delete all rows from `refresh_tokens` and roll the access secret.
- Refresh tokens are bearer credentials — treat like passwords. Store client-side in secure storage; do not log.
- Reuse detection: presenting a refresh token that is already revoked or unknown for a known family triggers revocation of the entire family (treated as token theft).
- Throttling: tune `THROTTLE_LIMIT` per environment; behind a load balancer ensure `trust proxy` is correct so the throttler sees the real client IP.
- Argon2id parameters are conservative (memCost 19MB, timeCost 2). Raise for stronger machines.
- Password policy: minimum 8 chars with upper + lower + digit. Adjust regex in `CreateUserDto` to match your policy.
- No password reset flow / email verification yet — add SMTP + token flow before opening to the public.
- Generic `Invalid credentials` on login failure — no user enumeration.

## Architecture

```
src/
  config/        zod env + ConfigModule
  prisma/        PrismaService + module (global)
  users/         User CRUD (DTO, service, controller, module)
  auth/          auth service, token service, strategies, guards, decorators
    dto/         RegisterDto, LoginDto, RefreshDto, TokenResponseDto
    strategies/  passport-jwt access + refresh
    guards/      JwtAccessGuard, JwtRefreshGuard, RolesGuard
    decorators/  @CurrentUser, @Public, @Roles
    types/       payload + meta types
  common/
    filters/     AllExceptionsFilter
  health/        terminus + Prisma ping
  app.module.ts
  main.ts        helmet, CORS, validation, swagger, logger
prisma/
  schema.prisma  User + RefreshToken
```

## License

MIT

## Postman / Newman

Collection + environment live at `.omc/research/postman-collection.json` and `postman-environment.json`.

```bash
# Run the full suite (skips admin tests if adminAccessToken is empty)
npx newman run .omc/research/postman-collection.json -e .omc/research/postman-environment.json
```

Admin tests (`List users (admin) - *`) are gated by the `adminAccessToken` collection variable. To run them:

```bash
# 1. Register and login a user, capture access token
EMAIL="admin+$(date +%s)@example.com"
TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"StrongP@ss1\"}" \
  http://localhost:3100/auth/register | jq -r .accessToken)

# 2. Promote that user to ADMIN
docker exec auth-api-db psql -U authapi -d auth_db \
  -c "UPDATE users SET role='ADMIN' WHERE email='$EMAIL';"

# 3. Re-login to get a fresh JWT with role=ADMIN
ADMIN_TOKEN=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"StrongP@ss1\"}" \
  http://localhost:3100/auth/login | jq -r .accessToken)

# 4. Run newman with adminAccessToken set
npx newman run .omc/research/postman-collection.json \
  -e .omc/research/postman-environment.json \
  --env-var adminAccessToken="$ADMIN_TOKEN"
```
