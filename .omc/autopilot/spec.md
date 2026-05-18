# Spec: NestJS User Auth API

## Goal
Production-grade user authentication REST API in NestJS with JWT access + refresh tokens, security best-practices.

## Stack
- **Runtime**: Node.js 20+ LTS
- **Framework**: NestJS 10.x (TypeScript strict)
- **DB**: PostgreSQL via Prisma ORM
- **Auth**: Passport.js (`passport-jwt`, `passport-local`) + `@nestjs/jwt`
- **Crypto**: argon2 (password hash), Node `crypto` (refresh token hash)
- **Validation**: `class-validator` + `class-transformer` + Zod for env
- **Testing**: Jest + Supertest
- **Lint**: ESLint + Prettier
- **Container**: Docker + docker-compose for Postgres

## Functional Requirements

### Endpoints
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | Public | Create user, return access+refresh |
| POST | `/auth/login` | Public (local) | Verify creds, return access+refresh |
| POST | `/auth/refresh` | Refresh JWT | Rotate refresh, return new pair |
| POST | `/auth/logout` | Access JWT | Revoke refresh token (current device) |
| POST | `/auth/logout-all` | Access JWT | Revoke all refresh tokens |
| GET | `/auth/me` | Access JWT | Current user profile |
| GET | `/users/:id` | Access JWT | User by id (self or admin) |

### Token Strategy
- **Access JWT**: 15 min TTL, HS256, payload `{sub, email, role, jti}`
- **Refresh JWT**: 7 days TTL, separate secret, payload `{sub, jti, family}`
- **Rotation**: every `/refresh` issues new pair, invalidates old refresh
- **Reuse detection**: if used refresh presented again → revoke entire family (token theft response)
- **Storage**: refresh `jti` hashed (sha256) in DB with userId, family, expiresAt, revokedAt, userAgent, ip

### User Model
```
id          uuid PK
email       string unique, lowercase
passwordHash string (argon2id)
role        enum(user, admin) default user
createdAt   timestamp
updatedAt   timestamp
```

### Refresh Token Model
```
id          uuid PK
userId      fk -> users
tokenHash   string unique (sha256 of jti)
family      uuid (rotation chain)
expiresAt   timestamp
revokedAt   timestamp nullable
replacedBy  uuid nullable (next token in chain)
userAgent   string nullable
ip          string nullable
createdAt   timestamp
```

## Security Requirements (OWASP-aligned)

1. **Passwords**
   - argon2id, memCost ≥ 19MB, timeCost 2, parallelism 1
   - Min 8 chars, validation via DTO
   - Never log/return passwordHash

2. **JWT**
   - Separate secrets for access vs refresh (env vars)
   - Short access TTL (15m), refresh rotation
   - jti claim for revocation
   - Issuer/audience claims validated

3. **Rate Limiting**
   - `@nestjs/throttler` global: 100 req/min
   - Tight on `/auth/login`, `/auth/register`: 5 req/min per IP
   - `/auth/refresh`: 10 req/min per IP

4. **Headers**
   - `helmet` middleware (CSP, HSTS, noSniff, frameguard)
   - CORS configured via env (whitelist)

5. **Input Validation**
   - Global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`
   - DTOs with class-validator
   - Email normalized (lowercase, trim)

6. **Errors**
   - Generic auth failure messages ("invalid credentials") — no user enumeration
   - Global exception filter, no stack traces in prod

7. **Secrets**
   - All via env (`.env.example` provided, `.env` gitignored)
   - Zod env schema, fail-fast on boot
   - No hardcoded secrets

8. **Logging**
   - Pino logger, structured JSON
   - Redact `password`, `token`, `authorization` fields
   - Audit log: register, login success/fail, logout, refresh, token reuse

9. **HTTPS**
   - Documented requirement; trust proxy for `X-Forwarded-*`
   - Cookie option (httpOnly, secure, sameSite=strict) if cookie mode enabled (optional, default header bearer)

10. **DB**
    - Parameterized queries (Prisma)
    - Migrations versioned
    - Connection via env, no superuser

## Non-Functional
- Boot fail-fast on missing env
- Health endpoint `/health` (db ping)
- OpenAPI/Swagger at `/api/docs` (gated in prod by env flag)
- Dockerized: `docker-compose up` runs Postgres + API
- README with setup, env vars, run, test, security notes

## Out of Scope (explicit)
- OAuth/social login
- Email verification flow
- Password reset (placeholder structure OK, no email send)
- 2FA/MFA
- Admin UI
- Multi-tenancy

## Acceptance
- `npm run build` succeeds
- `npm run lint` clean
- `npm test` passes (unit + e2e ≥ 80% on auth module)
- Register → login → access protected → refresh → logout flow works end-to-end
- Token reuse triggers family revoke (tested)
- Rate limits enforced (tested)
- No secrets in code
