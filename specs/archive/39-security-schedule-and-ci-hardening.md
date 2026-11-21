# Spec 39: Security, Schedule Integrity, Shutdown & CI/Docker Hardening

Status: shipped
Branch: spec/39-security-schedule-and-ci-hardening

## 1. Objective

Close high-priority server security vulnerabilities (Argon2 timing oracle, `Math.random()` pairing codes, unthrottled PIN redemption, spoofable Cloud Run IP rate limiting), fix daily schedule/archive/wordlist spoiler leaks, harden graceful shutdown, and eliminate CI/Docker production deployment defects and stale NUC artifacts.

## 2. Invariants & Non-Goals

- **Zero Spoiler Guarantee:** No public endpoint (`/api/archive`, `/api/puzzle`, `/api/puzzle/:number*`, `/api/word-find`, `/api/failed-guess`) may reveal future puzzle letters, words, or membership before their `Europe/Helsinki` scheduled date (including pre-epoch modulo wraparound), nor leak words shorter than `MIN_WORD_LENGTH` (4).
- **Constant-Time Auth & Cryptographic Randomness:** Admin login must run a real Argon2id verification on unknown usernames; 6-digit pairing codes must use CSPRNG (`crypto.randomInt`); pairing redemption and ticket creation must be rate-limited.
- **No Production Secrets Regression:** CI Cloud Run deployments must never wipe runtime env vars (such as `RESEND_API_KEY`) or ship dev-only packages (`tsx`/`esbuild`) or offline raw data (`nykysuomensanalista2024.txt`).
- **Non-Goals:** No visual/UI component changes (only minimal non-visual CSRF header plumbing in `admin-client.ts` / `useAdminStore.ts` for admin logout). No DB schema migrations (all fixes operate on existing tables). Admin route refactors, `hono/secure-headers`, and duplicate migration unification are handled in Spec 41.

## 3. Contract & Architecture

- **Admin Auth Security (`@sanakenno/server` & minimal `@sanakenno/web` CSRF plumbing):**
  - `packages/server/src/features/admin-auth/admin-auth.routes.ts` & `admin-auth.queries.ts`:
    - Export `DUMMY_HASH` and replace the invalid 7-byte-salt string (`dW5rbm93bg`) with a valid Argon2id hash containing a >=16-byte salt (matching default `argon2.hash` parameters) so unknown usernames execute real Argon2id verification instead of throwing `Salt is too short`.
    - Require `authMiddleware` + `requireCsrf` on `POST /api/auth/logout`, delete `c.get('sessionId')`, and call `deleteCookie` with matching `{ path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' }` options.
    - Update `updated_at = datetime('now')` in `updateAdminPassword`, and normalize space-formatted UTC timestamps before `Date.parse` in `validateAdminSession` (`admin-auth.queries.ts:83`).
  - `packages/web/src/api/admin-client.ts` & `packages/web/src/features/admin/useAdminStore.ts`:
    - Update `adminLogout(csrfToken?: string | null)` to send `X-CSRF-Token` (when present) and `init: { credentials: 'same-origin' }`, and pass `get().csrfToken` from `useAdminStore.logout()`.
- **Player Auth, Pairing & Rate Limiter Hardening (`@sanakenno/server`):**
  - `packages/server/src/features/player-auth/player-auth.queries.ts`:
    - Replace `Math.random()` in `generatePairingCode()` with `crypto.randomInt(100_000, 1_000_000)`.
    - In `createTransferTicket`: retry the 5-attempt loop ONLY when the caught error is a SQLite `UNIQUE` constraint violation on `code`; rethrow transient DB errors (`SQLITE_BUSY`, `STREAM_EXPIRED`, etc.) so `runImmediateTransactionWithRetry` handles them.
    - Fix `cleanupExpiredPlayerSessions` and `countActivePlayerSessions` to compare `julianday(expires_at) <= julianday(${nowIso})` / `julianday(expires_at) > julianday(${nowIso})` (binding JS `nowIso = new Date().toISOString()`). `julianday()` normalizes both ISO `T...Z` with milliseconds and legacy SQLite space-formatted UTC timestamps while honoring `vi.useFakeTimers()`. Also normalize space-formatted UTC timestamps before `Date.parse` in `validatePlayerToken` (`player-auth.queries.ts:104`).
  - `packages/server/src/features/player-auth/player-auth.routes.ts`, `player-auth.middleware.ts`, `send-transfer-link.ts`, & `packages/shared/src/schemas/player-sync.ts`:
    - Add rate limiters on `POST /api/player/auth/transfer/use` (per-IP cap: 10 attempts / 15 min to block 6-digit PIN brute-forcing) and `POST /api/player/auth/transfer/ticket` (10 / 15 min per player/IP), plus export reset helpers (e.g. `resetTransferUseRateLimit`, `resetTransferTicketRateLimit`, or a combined `resetPlayerAuthRateLimits`) wired into integration test `beforeEach`/`afterEach` hooks (`player-transfer-tickets.test.ts`, `player-sync.test.ts`).
    - Tighten `TransferCreatePayloadSchema` email validation (`z.string().trim().email()`), update `transferEmailErrorHook` to distinguish missing email (`'Sähköpostiosoite puuttuu'`) from invalid format (`'Virheellinen sähköpostiosoite'`), and reject non-empty malformed `player_key` in `handleTransferEmail` with `400` instead of silently skipping verification.
    - In `sendTransferLink`: strip trailing slashes from `baseUrl` (`baseUrl.replace(/\/+$/, '')`) and pass `signal: AbortSignal.timeout(10_000)` to `fetch`.
  - `packages/server/src/features/player-auth/rate-limiter.ts` & `player-auth.middleware.ts`:
    - Fix `getClientIp(c)` for Cloud Run: do not blindly trust spoofable `cf-connecting-ip` or the leftmost client-supplied `x-forwarded-for` entry; parse `x-forwarded-for` using `TRUSTED_PROXY_HOPS` (env var, default `1` for direct Cloud Run GFE, configurable to `2` if placed behind GCLB + Serverless NEG) selecting `parts[Math.max(0, parts.length - hops)]`, falling back to `x-real-ip` / `'unknown'`.
    - Replace fixed-window counter with a true sliding-window (or weighted sliding-window) limiter with bounded map capacity and amortized pruning (never O(N) full-map scan on every request once size > 1000).
    - Bound and prune `emailRateLimitMap` and key daily caps by `getHelsinkiDateString()` instead of UTC `toISOString().slice(0, 10)`.
- **Schedule, Archive, Wordlist & Telemetry Spoiler Fixes (`@sanakenno/server`):**
  - `packages/server/src/features/puzzle/puzzle.queries.ts`:
    - Fix `computeDaysRemainingInCycle` to calculate remaining days relative to `getCycleStartIndex(activeSlots)` so when slot `0` is active (played last in the cycle), the last day returns `1` and day 1 returns `activeSlots.length`.
  - `packages/server/src/features/puzzle/archive.routes.ts`:
    - Replace the `currentIndex` calculation with `requestedDays = allParam === 'true' ? activeSlots.length : 7`, compute `daysSinceEpoch` from `epoch_date` to `todayHelsinki`, and cap to `daysSinceEpoch < 0 ? 0 : Math.min(requestedDays, daysSinceEpoch + 1, activeSlots.length)` (returning `[]` if `days === 0`) so archive responses never walk before `epoch_date` or wrap modulo into future puzzles.
  - `packages/server/src/features/puzzle/puzzle.routes.ts`:
    - In `GET /api/puzzle?date=`: reject pre-epoch dates (`date < epochDate`) when `daysSinceEpoch < activeSlots.length` (first cycle) so `?date=<epoch-1>` cannot wrap modulo into a future puzzle.
    - In `GET /api/puzzle/:number/words`: filter `data.words` in memory instead of re-querying `blocked_words` + re-scanning the 90k wordlist, and clamp `minLength` to `Math.max(MIN_WORD_LENGTH, requestedMinLength)` so `?minLength=1` can never leak <4-letter words.
  - `packages/server/src/features/telemetry/telemetry.routes.ts`:
    - In `POST /api/word-find`: call `getSlotScheduleInfo(db, puzzle_number)` (2 parallel queries: `getActiveSlots` + `getEpochDate`). If `relation === 'inactive'`, return `400` with `{ error: 'Valittua peliä ei löydy tai se ei ole aktiivinen' }` immediately (preserving `tests/integration/telemetry.test.ts`'s `queries === 2` invariant). If `relation === 'future'`, return `403` (`{ error: 'Tulevaa kennoa ei voi vielä hakea' }`). For `'past'`/`'today'`, pass `activeSlots` into `getFullPuzzleBySlot(db, puzzle_number, activeSlots)`.
    - In `POST /api/failed-guess`: verify `date` is a real calendar date (reject rollovers like `2026-02-31`) and reject pre-epoch wraparound dates (`date < epochDate` during first cycle).
- **Lifecycle, CI, Docker & Stale Infrastructure Cleanup:**
  - `packages/server/src/index.ts`: In `shutdownServer(server, db, engine, timeoutMs = 5_000)`, invoke `server.closeIdleConnections?.()` (Node 22 `http.Server`), bound `server.close()` with a `timeoutMs` timer (cleared on normal close), and then run `checkpointAndDestroyDb` so Cloud Run `SIGTERM` never stalls on HTTP keep-alive connections.
  - `package.json` & `.github/workflows/ci-web.yml`:
    - Add `"check:ci": "pnpm run typecheck && pnpm run lint && pnpm run test:arch && pnpm run test:unit && pnpm run build"` (no `prettier --write`) and run `pnpm run check:ci` in CI so unformatted PRs fail CI.
    - Update `gcloud run deploy` in `.github/workflows/ci-web.yml` to use `--update-env-vars` (instead of `--set-env-vars`) so existing Cloud Run env vars such as `RESEND_API_KEY` are never wiped on deploy.
  - `packages/server/package.json`, `pnpm-lock.yaml`, `Dockerfile`, `.dockerignore`, `.gcloudignore`:
    - Move `"tsx"` from `packages/server/package.json` `dependencies` to `devDependencies` (refreshing `pnpm-lock.yaml` so `--frozen-lockfile` stays green).
    - In `Dockerfile`, copy only runtime assets (`kotus_words.txt` and `pangram-quality.json`) instead of the entire `assets/` directory (drops 2.7 MB `nykysuomensanalista2024.txt`).
    - Add `.screenshots/`, `**/dist`, `**/.turbo`, `tests/`, `specs/`, `scripts/` to `.dockerignore` and `.gcloudignore`.
  - Remove stale NUC & dead server files:
    - Delete `docker-compose.yml`, `scripts/deploy-sanakenno.sh`, and dead `packages/server/src/features/health/health.queries.ts`.
    - Fix `scripts/create-admin.ts` default `DB_PATH` from `./sanakenno.db` to `./sanakenno.dev.db` (matching `connection.ts`), and support `rotation_epoch` fallback in `scripts/verify-turso-parity.ts`.
    - Update `PROJECT_MAP.md` to reflect deleted stale files.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Admin Auth & Rate Limiter (`tests/integration/admin-puzzles.test.ts`, `tests/unit/admin-store.test.ts`, `tests/unit/rate-limiter.test.ts`):**
  - `argon2.verify(DUMMY_HASH, 'any-password')` resolves to `false` without throwing a salt-length error.
  - `POST /api/auth/logout` rejects missing/invalid CSRF with `403`, succeeds with valid CSRF, and `adminLogout(csrfToken)` in `useAdminStore` sends `X-CSRF-Token`; `updateAdminPassword` updates `updated_at`.
  - Update `tests/unit/rate-limiter.test.ts` (`L73-128`) for Cloud Run `TRUSTED_PROXY_HOPS` `x-forwarded-for` parsing (ignoring spoofed `cf-connecting-ip`), sliding-window boundary behavior, bounded pruning, and `emailRateLimitMap` pruning + Helsinki-date rollover.
- [x] **Player Auth & Pairing Security (`tests/integration/player-transfer-tickets.test.ts`, `tests/unit/send-transfer-link.test.ts`):**
  - `POST /api/player/auth/transfer/use` returns `429` after exceeding 10 attempts; `POST /api/player/auth/transfer/ticket` returns `429` when flooded.
  - `createTransferTicket` retries on `UNIQUE(code)` collision but rethrows transient `SQLITE_BUSY` / `STREAM_EXPIRED` errors.
  - `TransferCreatePayloadSchema` rejects invalid emails with `'Virheellinen sähköpostiosoite'`; malformed `player_key` returns `400`.
  - `cleanupExpiredPlayerSessions` and `countActivePlayerSessions` treat same-day future space-formatted UTC timestamps as active and honor fake timers via `julianday()`.
  - `sendTransferLink` strips trailing `/` from `baseUrl` and passes an `AbortSignal`.
- [x] **Schedule, Archive, Wordlist & Telemetry Spoiler Tests (`tests/integration/puzzle-archive.test.ts`, `tests/integration/puzzle-rpc.test.ts`, `tests/integration/telemetry.test.ts`, `tests/unit/verify-turso-parity.test.ts`):**
  - `computeDaysRemainingInCycle` returns `1` on slot `0` (last day of cycle) and `activeSlots.length` on day 1.
  - `GET /api/archive` and `GET /api/archive?all=true` during the first days after `epoch_date` never wrap modulo into future slots (update `puzzle-archive.test.ts:249-261` to test both the 7-day window when >=7 days past epoch AND early-epoch capping without wraparound).
  - `GET /api/puzzle?date=<pre-epoch>` during cycle 1 and `GET /api/puzzle/:number/words?minLength=1` never leak future slots or <4-letter words.
  - `POST /api/word-find` rejects future slots (`403`) while keeping `400` + `queries === 2` for inactive slots; `POST /api/failed-guess` rejects `2026-02-31` and pre-epoch wraparound dates.
  - `verify-turso-parity.ts` accepts legacy `rotation_epoch` config key when `epoch_date` is absent.
- [x] **Lifecycle & Packaging (`tests/integration/server-lifecycle.test.ts`, `tests/architecture.test.ts`):**
  - `shutdownServer` with short `timeoutMs` resolves cleanly even if `server.close` stalls, calling `closeIdleConnections` when available.
  - Architecture check verifies `tsx` is not in `packages/server/package.json` `dependencies`.

### Visual & Mechanical Gate

- [x] **Mechanical Gate:** `pnpm run check:agent` and `pnpm run check:ci` pass 100%
