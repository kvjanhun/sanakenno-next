# Spec 35: Turso (libSQL) Dialect, Async Migrations & Zero-Data-Loss Cutover Tooling

Status: shipped
Branch: spec/35-turso-libsql-dialect-and-maintenance-cutover

## 1. Objective

Enable Sanakenno's server to run transparently against a managed **Turso (libSQL)** database when `TURSO_DATABASE_URL` is configured—while keeping local `better-sqlite3` unchanged for development and tests—and add the two operational safety mechanisms required for a **zero-data-loss production cutover**: a database-free `MAINTENANCE_MODE` switch to flush and freeze the legacy Litestream writer cleanly, and a table-by-table parity verifier (`scripts/verify-turso-parity.ts`).

## 2. Invariants & Non-Goals

### Invariants
- **Zero Production Behavior Change Until Cutover:** When `TURSO_DATABASE_URL` is unset and `MAINTENANCE_MODE !== 'true'`, production continues to boot and run identically on local SQLite + Litestream. This spec is safe to ship to `main` before Turso is provisioned.
- **No Unmaintained Dialect Wrappers:** Connect to Turso via a thin, repo-owned Kysely `Dialect`/`Driver` built directly on `@libsql/client` (`packages/server/src/db/libsql-dialect.ts`), avoiding `@libsql/kysely-libsql` version lag and non-plain-object row bugs.
- **Full SQLite Behavioral Parity:**
  - All returned rows are plain JavaScript objects; `.returning('id')`, `numAffectedRows` (`numDeletedRows`), and `insertId` work identically across `better-sqlite3` and `@libsql/client`.
  - Interactive transactions execute via `client.transaction('write')` (`BEGIN IMMEDIATE` semantics in libSQL) with clean `commit()` / `rollback()`.
  - `PRAGMA foreign_keys = ON` is enforced so `ON DELETE CASCADE` across `player_sessions`, `player_transfer_tickets`, `player_stats`, and `player_puzzle_states` behaves identically to `better-sqlite3`.
- **Fast Cold-Start Migration Check:** On a Turso database that already has all migrations recorded in `schema_migrations`, startup executes a single check without re-running DDL or backfills.
- **Zero-Write-Overlap Maintenance Mode:** When `MAINTENANCE_MODE=true`, `scripts/entrypoint.sh` skips Litestream completely and `packages/server/src/index.ts` skips opening any database, allowing Cloud Run to route traffic to the maintenance revision and cleanly `SIGTERM`-flush the legacy Litestream instance before snapshotting.
- **Architectural Boundary:** Direct `@libsql/client` imports are confined to `packages/server/src/db/` (and `scripts/verify-turso-parity.ts`), matching the existing `better-sqlite3` boundary in `tests/architecture.test.ts`.

### Non-Goals
- Removing Litestream, `litestream.yml`, `scripts/entrypoint.sh`, or changing `.github/workflows/ci-web.yml` memory/scaling settings (deferred to **Spec 36**, after live Turso cutover is verified).
- Changing any frontend UI, game rules, or existing API payload shapes (other than widening `HealthResponseSchema.engine` to include `'kysely-libsql'`).

## 3. Contract & Architecture

### A. Shared Schema (`@sanakenno/shared`)
- **`packages/shared/src/schemas/health.ts`:**
  - Widen `engine` from `z.literal('kysely-sqlite')` to `z.enum(['kysely-sqlite', 'kysely-libsql'])`.

### B. Direct `@libsql/client` Kysely Dialect (`packages/server/src/db/libsql-dialect.ts`)
- Add `@libsql/client` to `packages/server/package.json` dependencies.
- Implement `LibsqlDialect`, `LibsqlDriver`, and `LibsqlConnection` (<180 lines):
  - Uses Kysely's `SqliteAdapter`, `SqliteIntrospector`, and `SqliteQueryCompiler`.
  - Accepts `{ url: string; authToken?: string; client?: Client }` (injectable `client` supports local `file::memory:` integration tests without network access).
  - Normalizes every `ResultSet.rows` entry into a plain `{ [col]: value }` object using `result.columns` (so JSON serialization and deep equality work cleanly).
  - Maps `result.lastInsertRowid` → `insertId` (`bigint | undefined`) and `result.rowsAffected` → `numAffectedRows` (`BigInt(result.rowsAffected)`).
  - Implements `beginTransaction` via `client.transaction('write')` (executing `PRAGMA foreign_keys = ON` on transaction/session start where needed) and routes queries inside the active transaction through `tx.execute(...)`, followed by `tx.commit()` / `tx.rollback()`.
  - Implements `destroy()` via `client.close()`.

### C. Dual-Backend Connection & Async Migrations (`packages/server/src/db/`)
- **`packages/server/src/db/async-migrations.ts`:**
  - Async equivalent of baseline DDL + `MIGRATIONS` (`0001`–`0005`) running over Kysely `sql` queries (`schema_migrations` fast-path check first; if all versions are present, skip DDL/backfill completely).
  - For fresh databases, executes baseline DDL statements and records `0001`–`0005` cleanly.
- **`packages/server/src/db/connection.ts`:**
  - Keep synchronous `createDb(dbPath?)` intact so all existing Vitest integration suites continue using fast in-memory `better-sqlite3` with zero churn.
  - Export `export type DbEngine = 'kysely-sqlite' | 'kysely-libsql'`.
  - Add `export async function initDb(env: NodeJS.ProcessEnv = process.env): Promise<{ db: Kysely<Database>; engine: DbEngine }>`:
    - If `env.TURSO_DATABASE_URL` is non-empty, create a `Kysely<Database>` using `LibsqlDialect({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })`, run `ensureForeignKeysOn` + `runMigrationsAsync(db)`, and return `{ db, engine: 'kysely-libsql' }`.
    - Otherwise call `createDb()` and return `{ db, engine: 'kysely-sqlite' }`.
  - Update `checkpointAndDestroyDb(db, engine = 'kysely-sqlite')` to skip `PRAGMA wal_checkpoint(TRUNCATE)` when `engine === 'kysely-libsql'` and simply call `await db.destroy()`.
  - Update `isSqliteBusyError` to also match libSQL busy/locked error codes (`SQLITE_BUSY`, `SQLITE_BUSY_SNAPSHOT`, `database is locked`) so `runImmediateTransactionWithRetry` works on both engines.
- **`packages/server/src/app.ts`, `packages/server/src/edge-middleware.ts`, `packages/server/src/features/health/health.routes.ts`, `packages/server/src/index.ts`:**
  - Thread optional `engine: DbEngine = 'kysely-sqlite'` through `createServerApp` → `createApp` → `createHealthRoutes` so `GET /api/health` reports the real active backend (`kysely-sqlite` or `kysely-libsql`).
  - Update `packages/server/src/index.ts` and `scripts/create-admin.ts` to initialize via `await initDb(process.env)`.

### D. Zero-DB Maintenance Mode for Clean Cutover
- **`scripts/entrypoint.sh`:**
  - If `[ "$MAINTENANCE_MODE" = "true" ]`, log `[maintenance] Skipping Litestream and starting maintenance server...` and `exec pnpm --filter @sanakenno/server start` without calling `litestream restore` or `litestream replicate`.
- **`packages/server/src/edge-middleware.ts` & `packages/server/src/index.ts`:**
  - Export `createMaintenanceApp(): Hono`:
    - Applies `edgeMiddleware` (security headers + canonical host redirects).
    - `GET /api/health` returns `200` `{ status: 'maintenance' }` with `Cache-Control: no-store` so Cloud Run startup probes succeed and terminate the old Litestream revision cleanly.
    - `GET /commit.txt` returns `200` commit SHA.
    - All other `/api/*` routes return `503` `{ error: 'Huoltokatko käynnissä. Yritä hetken kuluttua uudelleen.' }` with `Retry-After: 120` and `Cache-Control: no-store`.
    - All non-API routes return `503` minimal Finnish HTML maintenance notice with `Retry-After: 120` and `Cache-Control: no-store`.
  - In `packages/server/src/index.ts`, when `process.env.MAINTENANCE_MODE === 'true'`, boot `createMaintenanceApp()` without calling `initDb()` or `ensureBootSeed()`.

### E. Data Parity Verification CLI (`scripts/verify-turso-parity.ts`)
- Export testable `verifyDatabaseParity(localSqlitePath: string, remoteClient: Client): Promise<ParityReport>` plus a CLI entry point (`pnpm exec tsx scripts/verify-turso-parity.ts <local.db>` reading `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`):
  - Runs `PRAGMA integrity_check` on the local SQLite snapshot.
  - Compares exact row counts across all 17 application tables plus `schema_migrations`.
  - Compares high-signal data invariants:
    - `puzzles`: active count (`is_active = 1`), `SUM(COALESCE(max_score, 0))`
    - `players`: count + `MAX(id)`
    - `player_stats`: count, `SUM(best_score)`, `SUM(words_found)`, `MAX(updated_at)`
    - `player_puzzle_states`: count, `SUM(score)`, `MAX(updated_at)`
    - `word_finds`: count, `SUM(count)`, `MAX(last_at)`
    - `admins`: count + usernames set
    - `config`: `epoch_date` value
  - Prints a clear per-table summary and exits `0` only when every single check matches 100%, else exits `1`.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Architecture (`tests/architecture.test.ts`):** Enforces that `@libsql/client` imports in `packages/server/src/` are confined strictly to `packages/server/src/db/`.
- [x] **Integration (`tests/integration/libsql-dialect.test.ts`):** Exercises `LibsqlDialect` and `initDb` against a real local `@libsql/client` (`file::memory:` / temp file) verifying:
  - Baseline schema + idempotent `runMigrationsAsync` (second init is a fast no-op).
  - Plain JS object row mapping, `.returning('id')`, and `numDeletedRows`.
  - Interactive transactions (`commit` persists writes; thrown error triggers `rollback`).
  - `ON DELETE CASCADE` enforcement (`PRAGMA foreign_keys = ON`) when deleting a `players` row cascades to `player_sessions` and `player_stats`.
  - Full Hono API smoke path (`GET /api/health` returning `engine: 'kysely-libsql'`, `POST /api/player/auth/init`, `POST /api/player/sync/progress`, `GET /api/player/sync`) running end-to-end against the libSQL Kysely instance.
- [x] **Integration (`tests/integration/maintenance-mode.test.ts`):** Verifies `createMaintenanceApp()` serves `200` on `/api/health`, `503` + `Retry-After: 120` + Finnish JSON on `/api/puzzle` and `/api/player/sync/progress`, and `503` + Finnish HTML on `/` with security headers intact.
- [x] **Unit (`tests/unit/verify-turso-parity.test.ts`):** Verifies `verifyDatabaseParity` passes on identical SQLite/libSQL databases and fails with explicit table/metric diffs when a `player_stats` row or score is missing or altered.

### Visual & Mechanical Gate

- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
