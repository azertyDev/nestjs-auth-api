# Plan: Admin User Seed for NestJS Auth API

**Status:** pending approval
**Mode:** direct
**Saved at:** .omc/plans/admin-seed.md

## Requirements Summary

Add an idempotent seed script that ensures a single ADMIN user exists in the database, configured via environment variables. The seed runs automatically as part of the Docker compose boot sequence and can also be triggered locally via npm script. If `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars are not set, the seed exits 0 silently (no failure).

## Acceptance Criteria

1. `npx prisma db seed` runs without error when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set in env and creates a user with `role=ADMIN` and an argon2id-hashed password.
2. Running `npx prisma db seed` twice in a row produces the same database state (idempotent). The second run logs `admin already up to date` and does **not** rewrite `passwordHash` if the same password was already set (avoid lock/CPU cost on every boot).
3. If `ADMIN_PASSWORD` is changed in env, the next `db seed` run **updates** `passwordHash` (verified via `argon2.verify` against new password).
4. If `ADMIN_EMAIL` is missing from env, the seed exits with code 0 and stdout `[seed] ADMIN_EMAIL not set, skipping`. No error.
5. `POST /auth/login` with the seeded credentials returns 200 and a JWT whose payload contains `role: "ADMIN"`.
6. `GET /users` with the seeded admin's bearer token returns 200 (admin guard passes).
7. `docker compose up -d --build` from a clean volume produces the admin user automatically without any extra command (verified end-to-end).
8. The unit test suite still passes (`npm test`: 14/14). The e2e suite still passes (`npm run test:e2e`: 11/11).
9. No existing endpoint behavior changes. No production secret is committed to the repo.

## Implementation Steps

### Step 1 — Add seed env vars to Zod schema
**File:** `src/config/env.schema.ts:18` (after existing JWT block)
- Add optional fields:
  - `ADMIN_EMAIL: z.string().email().optional()`
  - `ADMIN_PASSWORD: z.string().min(8).optional()` (relaxed: seed validates further)
- Add a `superRefine` rule: if one of `ADMIN_EMAIL` / `ADMIN_PASSWORD` is set, both must be set (else fail boot with clear message).
- **Rationale:** Catches the half-configured case at boot, not at first DB seed.

### Step 2 — Create the seed script
**File (new):** `prisma/seed.ts`
- Use `PrismaClient` directly (no Nest bootstrap — keeps seed lightweight).
- Read `process.env.ADMIN_EMAIL` and `ADMIN_PASSWORD`. If either is missing, `console.log('[seed] ADMIN_EMAIL not set, skipping')` and `return`.
- Normalize email: `.toLowerCase().trim()`.
- Validate password meets API policy regex `/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}/`. If not, throw with actionable message.
- Use `prisma.user.upsert`:
  - **where:** `{ email }`
  - **update:** check existing.passwordHash via `argon2.verify(existing.passwordHash, ADMIN_PASSWORD)`. If matches **and** existing.role === 'ADMIN', skip (`log 'already up to date'`). Else update `{ passwordHash: <new argon2id hash>, role: 'ADMIN' }`.
  - **create:** `{ email, passwordHash: <new argon2id hash>, role: 'ADMIN' }`
- Use the same argon2 options as `auth.service.ts:10-15` (`type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1`).
- On success: `console.log('[seed] admin user ensured: ' + maskEmail(email))`. Mask: keep first char + domain.
- Always call `await prisma.$disconnect()` in a `finally`.

### Step 3 — Wire Prisma's `db seed` hook
**File:** `package.json`
- Add top-level field:
  ```json
  "prisma": { "seed": "ts-node --transpile-only prisma/seed.ts" }
  ```
- Add convenience script: `"prisma:seed": "prisma db seed"`.
- **Note:** `ts-node` is already in devDependencies. The image production build prunes devDeps, so we must either keep `ts-node` available at runtime or precompile.

### Step 4 — Make seed runnable in production Docker image
**Decision:** precompile seed to JS during the build stage rather than ship `ts-node` in runtime.

**Files:**
- `Dockerfile`:
  - In the `build` stage, after `npm run build` (`Dockerfile:14`), add: `RUN npx tsc -p tsconfig.build.json --outDir dist || true` is **not** needed because Nest already compiles `prisma/seed.ts` if included in `tsconfig.build.json`.
  - Update `tsconfig.build.json` to include `prisma/**/*` (currently it only includes `src`). The compiled output goes to `dist/prisma/seed.js`.
  - In the `runtime` stage, COPY `dist/prisma` (already part of `dist`).
- `package.json`:
  - Change `prisma.seed` to: `"seed": "node dist/prisma/seed.js"`. Prisma CLI invokes that for `db seed`.
  - Keep `"prisma:seed"` script as before.
- **Rationale:** Avoids 100MB+ of dev deps in the production image.

### Step 5 — Run seed after migrate in compose
**File:** `docker-compose.yml:33`
- Change `api.command` from:
  ```
  sh -c "npx prisma migrate deploy && node dist/main.js"
  ```
  to:
  ```
  sh -c "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"
  ```
- Add env vars to `api.environment`:
  - `ADMIN_EMAIL: ${ADMIN_EMAIL:-}`
  - `ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}`
- **Behavior:** If unset, seed exits 0 (per Step 2), boot continues.

### Step 6 — Document in `.env.example` and `README.md`
**File:** `.env.example`
- Append:
  ```
  # Admin seed (optional — seed runs on boot if both set)
  ADMIN_EMAIL=admin@local
  ADMIN_PASSWORD=ChangeMe-StrongP@ss1
  ```

**File:** `README.md`
- Add a section `## Initial admin` explaining: how the seed works, that it's idempotent, that the password regex must match, and how to rotate by changing env + restarting the container.

### Step 7 — Update `.env` (local, gitignored)
- Add `ADMIN_EMAIL=admin@local` and `ADMIN_PASSWORD=Local-AdminP@ss1` (or user-supplied) so the local stack creates the admin on next boot.

### Step 8 — Test runs
- `npm run build` — clean.
- `npm test` — 14/14.
- `npm run test:e2e` — 11/11 (e2e doesn't touch real DB, unaffected).
- `docker compose down` then `docker compose up -d --build` — confirm logs include `[seed] admin user ensured` and `POST /auth/login` with seeded creds returns a JWT carrying `role: "ADMIN"`.
- Re-run `docker exec auth-api-app npx prisma db seed` — confirm second log line is `[seed] admin already up to date`.

### Step 9 — Postman variables (optional, no code change)
- After Step 8, capture the admin's accessToken and set `adminAccessToken` collection variable in Postman (manually or via Newman `--env-var`). This unblocks the 3 currently-skipped admin tests.

### Step 10 — Commit + push
- One commit: `feat(seed): idempotent admin user seed via prisma db seed`.
- Push to `origin/dev`.

## Risks and Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Production secret leaks via committed `.env` | `.env` already in `.gitignore` — verified at line 4. Step 6 only adds `.env.example` (placeholder). |
| R2 | Weak `ADMIN_PASSWORD` (regex-passing but trivially guessable) | Step 2 validates regex but cannot judge entropy. Mitigation: README warns to use `openssl rand -base64 16` and rotate periodically. |
| R3 | Seed rewrites `passwordHash` on every boot — wasted CPU and lock | Step 2 verifies existing hash first with `argon2.verify`; only writes when password changed. |
| R4 | Existing real admin gets silently downgraded if email collides | Upsert by email is intentional. Document in README that the seed **owns** that email — operators must pick an email reserved for the seed (e.g. `admin@local`). |
| R5 | Seed runs on every container restart and slows boot | Idempotency check (R3) keeps the steady-state cost to one `argon2.verify` (~25 ms) + 1 SELECT — negligible. |
| R6 | `ts-node` not present in runtime image causes `prisma db seed` to fail in production | Step 4 precompiles `prisma/seed.ts` to `dist/prisma/seed.js` and points the Prisma hook at the compiled file. |
| R7 | Seed runs **before** migration completes if compose ordering changes | The `api.command` chain (`migrate deploy && db seed && main`) is sequential by shell `&&`. Failure of migrate short-circuits seed. |
| R8 | Half-set env (`ADMIN_EMAIL` set but `ADMIN_PASSWORD` unset) silently skips | Step 1 `superRefine` makes this a hard boot failure with an explicit error message. |
| R9 | Multiple API replicas race on seed | Prisma `upsert` is atomic at row level (Postgres unique constraint on `email`). Worst case: one upsert wins, the rest no-op. Safe. |
| R10 | Seed exposes `ADMIN_PASSWORD` in logs | `maskEmail()` log helper. Password never logged. |

## Verification Steps

1. **Static checks:** `npm run lint` returns no errors. `npm run build` succeeds, `dist/prisma/seed.js` exists.
2. **Idempotency unit-level:** From host, run `docker exec auth-api-app npx prisma db seed` twice; stdout shows `[seed] admin user ensured` then `[seed] admin already up to date`. `docker exec auth-api-db psql ... -c "SELECT count(*) FROM users WHERE role='ADMIN' AND email='admin@local'"` returns `1`.
3. **Auth flow:** `curl -X POST -H 'Content-Type: application/json' -d '{"email":"admin@local","password":"Local-AdminP@ss1"}' http://localhost:3100/auth/login` returns 200. Decode JWT payload via `base64 -d` and confirm `role === "ADMIN"`.
4. **Authorization:** `curl -H "Authorization: Bearer <admin token>" http://localhost:3100/users?page=1&limit=5` returns 200 with paginated body containing `data`, `total`, etc.
5. **Skip path:** Unset `ADMIN_EMAIL` in `.env`, recreate `auth-api-app` container, confirm boot logs show `[seed] ADMIN_EMAIL not set, skipping` and API still serves.
6. **Half-set guard:** Set only `ADMIN_EMAIL` (no password) — boot fails with `ADMIN_EMAIL and ADMIN_PASSWORD must be set together`.
7. **Existing suite:** `npm test` 14/14 and `npm run test:e2e` 11/11 unchanged.
8. **Newman full-flow:** `npm run newman` (or direct `npx newman run ...`) → 25/25 assertions still green. Then run with `--env-var adminAccessToken=<token>` → expect 25+ (formerly skipped admin tests now run and pass).

## Out of Scope

- Multi-admin seed (only one admin per run).
- Email verification flow for admin.
- Admin password reset endpoint (use env rotation).
- Role-based UI in Swagger.

---

**Approval required before any code is written.** This plan touches Dockerfile, tsconfig.build.json, package.json prisma hook, docker-compose, env schema, README, and adds `prisma/seed.ts`. After approval, recommended execution path: `Skill("oh-my-claudecode:ralph")` with this plan path.
