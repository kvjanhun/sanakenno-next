# Spec 41: Backend & Shared Lean-Out — Unified Async Migrations, `hono/secure-headers`, Admin API Fixes & Dead Code Trim

Status: shipped
Branch: spec/41-backend-lean-out-migrations-and-admin-api-fixes

## 1. Objective

Eliminate duplicated backend/shared infrastructure (unifying dual sync+async DB migration runners onto one Kysely async runner and replacing custom security-header boilerplate with `hono/secure-headers`), fix admin backend 500s/N+1/validation bugs, and prune unused exports across `@sanakenno/shared` and `@sanakenno/server`.

## 2. Invariants & Non-Goals

- **100% Schema & Production DB Parity:** Unifying migrations MUST preserve the exact `schema_migrations` version strings (`0001-baseline` through `0005-add-player-transfer-tickets`), table schemas, and single-query fast-path on already-migrated Turso/SQLite databases.
- **Exact Security Header Parity:** Adopting `hono/secure-headers` MUST emit all required headers (`Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=(), microphone=(), focus-without-user-activation=()`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Cross-Origin-Resource-Policy: same-origin`, and the exact existing `Content-Security-Policy`) on API, HTML, 302 redirects, maintenance, and 404 responses.
- **Kysely, RPC & File-Size Boundaries:** All SQL stays in `*.queries.ts` or `src/db/`; all route files stay method-chained with `@hono/zod-validator`; every file stays <= 500 lines (in particular, keep `admin-puzzles.routes.ts` below 500 lines by placing bulk schedule and affected-puzzle `max_score` helpers in `admin-puzzles.queries.ts`).
- **Non-Goals:** No frontend UI or visual changes. Do not replace `libsql-dialect.ts`, `db/retry.ts`, the 10-entry puzzle LRU cache, or `send-transfer-link.ts` (all verified leaner custom than external packages). Keep `scripts/migrate-v1-db.ts` and `scripts/verify-turso-parity.ts` functional as standalone utilities.

## 3. Contract & Architecture

- **Unified Async DB Migrations (`@sanakenno/server`):**
  - `packages/server/src/db/connection.ts`, `baseline-sql.ts`, `async-migrations.ts`, `migrate-v1.ts`, `libsql-dialect.ts`, `packages/server/src/testing.ts`, `scripts/migrate-v1-db.ts`:
    - Make `createDb`, `createTestHarness`, and `migrateV1DatabaseFile` `async` (and `await createDb(dbPath)` in `initDb` and `await migrateV1DatabaseFile(...)` in `scripts/migrate-v1-db.ts`) and run `runMigrationsAsync(db)` for both local `better-sqlite3` and Turso (`@libsql/client`) so there is only **one** migration/backfill implementation.
    - Export `BackfillStatsSummary`, `backfillPlayerStatsAsync` (returning `Promise<BackfillStatsSummary>` with `{ statsBackfilled, dailyStatsCount, longWordsBackfilledCount }`), and `recomputePuzzleMaxScoresAsync` from `async-migrations.ts`.
    - Delete the duplicate sync migration runner from `baseline-sql.ts` (`MIGRATIONS`, `runMigrations`, `ensureColumn`, `seedCuratedBlockedWords`, `recomputePuzzleMaxScores`) and delete `packages/server/src/db/backfill-stats.ts`. Replace naive `BASELINE_SQL.split(';')` with an explicit `export const BASELINE_STATEMENTS: readonly string[]` list of DDL statements, and keep `export const BASELINE_SQL = BASELINE_STATEMENTS.join(';\n')` for existing raw-SQLite test setup (`tests/integration/db-parity.test.ts`).
    - Fix `backfillPlayerStatsAsync` (`async-migrations.ts`) to convert SQLite UTC `updated_at` (`row.updated_at.replace(' ', 'T') + 'Z'`) to `Europe/Helsinki` date via `getHelsinkiDateString` instead of UTC `.slice(0, 10)`.
    - In `LibsqlDriver.init()` (`libsql-dialect.ts:140-142`): skip the one-shot `PRAGMA foreign_keys = ON` only for remote Turso URLs (`libsql:`, `https:`, `http:`, `ws:`, `wss:`) where it is a wasted cold-start RTT over stateless HTTP/Hrana, while retaining it for local `file:` / `:memory:` `@libsql/client` instances (which default `foreign_keys = OFF`, preserving `tests/integration/libsql-dialect.test.ts`).
    - Exclude `src/testing.ts` and `src/db/migrate-v1.ts` from `packages/server/tsconfig.build.json` so test/CLI-only files are not compiled into production `dist/`.
    - Update all `createDb` / `createTestHarness` callers in `tests/` (`production-snapshot.test.ts`, `verify-turso-parity.test.ts`, `server-lifecycle.test.ts`, `edge-middleware.test.ts`, `db-parity.test.ts`, `blocked-words-migration.test.ts` [replace direct `runMigrations(rawSqlite)` with `createDb` / `runMigrationsAsync`], and the 9 `createTestHarness()` integration test files including `health.test.ts`'s sync `beforeEach`).
- **Built-In `hono/secure-headers` (`@sanakenno/server`):**
  - `packages/server/src/edge-middleware.ts` & `packages/server/src/features/admin-auth/admin-auth.middleware.ts`:
    - Mount `secureHeaders(...)` from `hono/secure-headers` **before** `edgeMiddleware` in both `createServerApp` and `createMaintenanceApp` (covering 200, 302 host redirects, 503 maintenance, and 404 responses, allowing removal of the duplicated header loop in `app.notFound`).
    - Explicitly override Hono's differing defaults (`strictTransportSecurity: 'max-age=31536000; includeSubDomains'`, `xFrameOptions: 'DENY'`, `referrerPolicy: 'strict-origin-when-cross-origin'`, `crossOriginOpenerPolicy: 'same-origin-allow-popups'`, `crossOriginResourcePolicy: 'same-origin'`, `xContentTypeOptions: 'nosniff'`, `permissionsPolicy: { camera: [], geolocation: [], microphone: [], focusWithoutUserActivation: [] }`, and `contentSecurityPolicy` matching all existing directives). Keep Hono's safe extra defaults (`X-XSS-Protection: 0`, `Origin-Agent-Cluster: ?1`, etc.).
    - Keep `EDGE_SECURITY_HEADERS` exported (or update `tests/integration/edge-middleware.test.ts` and `tests/integration/maintenance-mode.test.ts` to assert each required header explicitly) and guard the `/manifest.webmanifest` `Content-Type` override with `c.res.status >= 200 && c.res.status < 300` so 404/500 responses are not mislabelled as manifests.
    - Simplify `admin-auth.middleware.ts` `securityHeaders` to only set `Cache-Control: no-store`.
- **Admin Backend Fixes (`@sanakenno/server` & `@sanakenno/shared`):**
  - `packages/server/src/features/admin-puzzles/admin-puzzles.routes.ts` & `admin-puzzles.queries.ts`:
    - `insertBlockedWord`: use `.onConflict((oc) => oc.column('word').doNothing()).returning('id')` and return **`409 Conflict`** (`{ error: 'Sana on jo estetty' }`) on duplicates instead of unhandled 500.
    - `POST /admin/block` and `DELETE /admin/block/:id`: read the deleted word via `DELETE ... RETURNING word` (returning `404` if not found), and add a helper in `admin-puzzles.queries.ts` that filters active puzzles in memory to **only affected puzzles** whose `(letters, center)` can form the normalized blocked/unblocked word (contains `center` and every char in `letters`), recomputes `computePuzzle` only for those affected rows, and updates `puzzles.max_score` only when the value actually changes (avoiding full-table scans or long Turso write locks).
    - `swapPuzzles` / `POST /admin/puzzle/swap`: require both slots to exist and be `is_active = 1`; return `404` (not 500) when missing or soft-deleted.
    - Move `nextFreeSlot` and `findDuplicateConflicts` inside `runImmediateTransactionWithRetry` on puzzle create/save to prevent concurrent slot-allocation races.
    - `getNeighbourSlots`: filter `.where('is_active', '=', 1)` so prev/next navigation never lands on soft-deleted slots.
    - `GET /admin/schedule`: validate `start` is a real calendar date (reject rollovers like `2026-99-99` or `2026-02-31` with `400`, not 500). Move bulk schedule assembly into `admin-puzzles.queries.ts`: fetch active puzzles, `epoch_date`, and `blocked_words` in 3 parallel queries total (for any `days` up to 90), memoize `computePuzzle` per unique slot in-request (reusing `getCachedPuzzle(slot)` on hit without polluting the 10-entry LRU), and preserve the exact response shape (`word_count`, `max_score`, `pangram_count`, etc.) expected by `Schedule.tsx`.
  - `packages/server/src/features/admin-suggestions/admin-suggestions.routes.ts`, `admin-suggestions.queries.ts`, `suggestion-scorer.ts`, & `packages/shared/src/schemas/admin.ts`:
    - Add an `optionalQueryInt` Zod helper (`z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int()...)`) so empty query strings (like `?in_rotation=` for `"Kaikki"`) map cleanly to `undefined` instead of `0`, non-integers/`NaN`/out-of-range return `400`, `in_rotation` accepts only `0 | 1`, and `per_page` is bounded `1..200` consistently between route pagination (`pages = Math.ceil(total / perPage)`) and query limit.
    - Wrap `POST /admin/suggestion-rejections` and `DELETE /admin/suggestion-rejections/:id` + `insertAdminLog` in `runImmediateTransactionWithRetry`.
    - Fix `selectCandidatePool` (`suggestion-scorer.ts:240-244`) so `'unreviewed'` (`-10`) ranks above `'risky'` (`-80`).
  - `packages/server/src/features/admin-analytics/admin-analytics.routes.ts` & `admin-analytics.queries.ts`:
    - Allow valid slot `0` and reject non-integers like `1.5` on `GET /admin/word-finds` (`Number.isInteger(pNum) && pNum >= 0`).
    - Filter `getAchievementRows` results to the exact Helsinki `days` window set *before* aggregating `daily` and `totals` in `groupAchievementsByDay` (so out-of-window rows never leak into `totals` in either `mode=all` or `mode=users`), and compute `getFailedGuessRows` cutoff using `getHelsinkiDateString` instead of UTC.
- **Dead Code & Subtle Domain Cleanup (`@sanakenno/shared`, `@sanakenno/server`, `@sanakenno/web`):**
  - Remove dead `_cacheGeneration` / `bumpPuzzleCacheGeneration` / `getPuzzleCacheGeneration` from `packages/server/src/features/puzzle/wordlist.ts` (replacing callers in routes and `tests/integration/puzzle-archive.test.ts:14,65` with `invalidatePuzzleCache()`).
  - Prune unused exports across `packages/shared/src/index.ts`, `scoring.ts`, `auth-types.ts`, and `schemas/` (deprecated `NO_HINT_ACHIEVEMENTS` / `noHintAchievementStates` / `NoHintAchievement*`, dead `AuthToken`, mismatched camelCase `AdminScheduleEntrySchema`, and unreferenced schema/type re-exports) and unexport internal-only helpers in `packages/server/src/`.
  - Fix subtle domain & timezone quirks:
    - `packages/shared/src/hint-data.ts`: normalize words with `normalizeFinnishText` in `getFoundPangrams` and look up `foundByLetterAndLen[normalizeFinnishText(l)]` in `matrixCells`.
    - `packages/shared/src/scoring.ts`: compute `Math.ceil((pct * maxScore) / 100)` across `rankThresholds`, `noHintMilestoneStates`, and `progressToNextRank`, and use integer multiplication `score * 100 >= r.pct * maxScore` in `rankForScore` / `progressToNextRank` so thresholds and ranks agree identically for all integers (e.g. `maxScore = 30`, `score = 3`).
    - `packages/web/src/features/gameplay/useMidnightRollover.ts` & `packages/shared/src/stats.ts`: compute `msUntilMidnight` via `Intl.DateTimeFormat.formatToParts` (DST-safe across non-Helsinki browser timezones) and parse ISO dates in `computeStreak` using `Date.UTC` instead of local `'T12:00:00'`.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Unified Async Migrations (`tests/integration/db-parity.test.ts`, `tests/integration/blocked-words-migration.test.ts`, `tests/integration/production-snapshot.test.ts`, `tests/integration/libsql-dialect.test.ts`):**
  - `createDb`, `createTestHarness`, and `migrateV1DatabaseFile` run `runMigrationsAsync` cleanly on both `:memory:` SQLite and file SQLite, matching Turso parity and preserving `ON DELETE CASCADE` on local `file:` libSQL.
  - `backfillPlayerStatsAsync` classifies a `22:30Z` UTC timestamp (00:30/01:30 Helsinki next day) under the Helsinki calendar date.
- [x] **Edge Middleware (`tests/integration/edge-middleware.test.ts`, `tests/integration/maintenance-mode.test.ts`):**
  - All required security headers are present on API, HTML, 302 redirects, maintenance, and 404 responses via `hono/secure-headers`; 404 on `/manifest.webmanifest` does not return `application/manifest+json`.
- [x] **Admin API Regressions (`tests/integration/admin-puzzles.test.ts`, `tests/integration/admin-suggestions.test.ts`, `tests/integration/admin-analytics.test.ts`, `tests/unit/suggestion-scorer.test.ts`):**
  - Duplicate blocked word returns `409` (not 500); blocking/unblocking updates `puzzles.max_score` in DB only for affected puzzles; swapping a missing or soft-deleted slot returns `404`; `getNeighbourSlots` skips inactive slots; `GET /admin/schedule?start=2026-99-99` returns `400` and `days=90` completes without N+1 DB queries.
  - `/admin/combinations?per_page=0`, `?per_page=201`, and `?per_page=abc` return `400`, while `?in_rotation=` (empty string) succeeds as unfiltered; `selectCandidatePool` prefers `'unreviewed'` over `'risky'`.
  - `GET /admin/word-finds?puzzle_number=0` succeeds while `1.5` returns `400`; `groupAchievementsByDay` `totals` equals the sum of `daily` buckets for `mode=all` and counts only in-window unique sessions for `mode=users`.
- [x] **Shared Domain & DST (`tests/unit/shared-domain.test.ts`, new `tests/unit/midnight-rollover.test.ts` [do NOT append to 495-line `modals-theme-rollover.test.tsx`], `tests/unit/wordlist.test.ts`, `tests/integration/puzzle-archive.test.ts`):**
  - `rankThresholds` / `progressToNextRank` agree with `rankForScore` for float-sensitive `maxScore` (`maxScore = 30`, `score = 3`).
  - `msUntilMidnight` computes exact remaining ms without local-timezone string parsing; update `wordlist.test.ts` and `puzzle-archive.test.ts` for removed `_cacheGeneration`.

### Visual & Mechanical Gate

- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%
