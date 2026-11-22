# Spec 44: Legacy Migration Retirement, Dead Schema & Cutover Cleanup

Status: shipped
Branch: spec/44-legacy-migration-retirement-and-schema-cleanup

## 1. Objective

Retire all completed Sanakenno 1.0 → 2.0 and Turso cutover scripts, backfills, runbooks, and tests, drop unused legacy database schema (`page_views`, `config.rotation_epoch`), and remove stale local-volume (`DATA_DIR`) and single-slot `localStorage` migration code so the repository reflects only the live 2.0 + Turso architecture.

## 2. Invariants & Non-Goals

### Invariants

- **Zero Data Loss on Live Turso:** Never run destructive DDL against tables holding live player or puzzle data (`players`, `puzzles`, `player_stats`, `player_puzzle_states`, `player_sessions`). In particular, never rebuild or drop `players` (which has `ON DELETE CASCADE` children).
- **Single-Query Migration Fast-Path:** Preserve existing `schema_migrations` version identifiers (`0001-baseline` through `0006-add-player-puzzle-state-revealed`) so already-migrated Turso databases run only the new `0007-cleanup-legacy-schema` migration once and return to a single-query boot check thereafter.
- **Curated Blocked Words Preserved:** Fresh local dev/test databases created via `createDb()` MUST continue to seed `CURATED_BLOCKED_WORDS` cleanly.
- **500-Line Ceiling & Architectural Boundaries:** Every source, test, and script file stays under 500 lines; `tests/architecture.test.ts` stays 100% green.

### Non-Goals

- Changing puzzle computation/caching (deferred to Spec 45), player sync storage consolidation (deferred to Spec 46), or admin package extraction (deferred to Spec 47).
- Dropping `players.email` column via table rebuild on Turso (unsafe with `ON DELETE CASCADE`).

### Confirmed Defaults (In-Scope Retention)

- Keep `admin_log` table and `insertAdminLog` audit trail.
- Keep `MAINTENANCE_MODE` (`createMaintenanceApp`) as a lightweight zero-DB emergency kill-switch.
- Keep `next.sanakenno.fi` host redirect alongside `www.sanakenno.fi` in `edge-middleware.ts`.

## 3. Contract & Architecture

### A. Delete Completed 1.0 & Turso Cutover Tooling

- Delete obsolete files:
  - `packages/server/src/db/migrate-v1.ts`
  - `scripts/migrate-v1-db.ts`
  - `scripts/verify-turso-parity.ts`
  - `specs/TURSO_MIGRATION_RUNBOOK.md`
  - `tests/unit/verify-turso-parity.test.ts`
  - `tests/integration/production-snapshot.test.ts`
- Remove `"db:migrate-v1"` from root `package.json`, remove `"src/db/migrate-v1.ts"` from `packages/server/tsconfig.build.json`, and remove `openReadonlySqlite` from `packages/server/src/db/connection.ts`.

### B. Database Schema & Migration Lean-Out (`@sanakenno/server`)

- **`packages/server/src/db/schema.ts` & `baseline-sql.ts`:**
  - Remove `PageViewsTable` and `page_views` from `Database`, and remove `CREATE TABLE IF NOT EXISTS page_views` plus `idx_page_views_date` / `idx_page_views_visitor` from `BASELINE_STATEMENTS`.
  - Remove optional `email?: string | null` from `PlayersTable` in `schema.ts` and delete the legacy `players.email` `catch` fallback in `packages/server/src/features/player-auth/player-auth.queries.ts`.
  - Remove the unused `BASELINE_SQL` raw-string export (keep `BASELINE_STATEMENTS`).
- **`packages/server/src/db/async-migrations.ts`:**
  - Delete dead 1.0 backfill machinery: `recomputePuzzleMaxScoresAsync`, `backfillPlayerStatsAsync`, `parseUpdatedAtToHelsinkiDate`, and `BackfillStatsSummary`.
  - Keep `0001-baseline` through `0006-add-player-puzzle-state-revealed` version keys in `ASYNC_MIGRATIONS` as lightweight idempotent entries (preserving `0003-seed-curated-blocked-words` seeding `CURATED_BLOCKED_WORDS` on fresh DBs without scanning puzzles).
  - Append `0007-cleanup-legacy-schema`:
    - `DROP TABLE IF EXISTS page_views`
    - `DROP TABLE IF EXISTS player_transfer_tokens`
    - Normalize any legacy `config.rotation_epoch` row into `config.epoch_date` (`INSERT OR IGNORE INTO config (key, value) SELECT 'epoch_date', value FROM config WHERE key = 'rotation_epoch'`) and `DELETE FROM config WHERE key = 'rotation_epoch'`.
- **`packages/server/src/features/puzzle/puzzle.queries.ts`:**
  - Simplify `getEpochDate` to query only `key = 'epoch_date'` (drop legacy `rotation_epoch` fallback).
- **Stale NUC/Volume Paths (`connection.ts`, `index.ts`, `wordlist.ts`):**
  - Remove unused `process.env.DATA_DIR` and `'/data/kotus_words.txt'` fallback paths; use `DB_PATH` (defaulting to `'./sanakenno.dev.db'`) and `WORDLIST_PATH` / bundled `assets/kotus_words.txt`.

### C. Client Legacy Storage Cleanup (`@sanakenno/web`)

- **`packages/web/src/features/gameplay/storage.ts` & `packages/web/src/features/player-sync/useAuthStore.ts`:**
  - Delete `LEGACY_STATE_KEY` (`'sanakenno_state'`), `LegacyPersistedPuzzleState`, and the single-slot legacy migration branch inside `readSavedPuzzleState()` and `logout()`.

### D. Docs Alignment

- Update `PROJECT_MAP.md` and `README.md` to remove references to `migrate-v1-db.ts`, `verify-turso-parity.ts`, and 18-table counts (updating to current table count).

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Integration (`tests/integration/db-migrations.test.ts`, replacing `tests/integration/db-parity.test.ts`):**
  - Opening a fresh SQLite DB via `createDb()` applies `0001`–`0007`, creates all active tables with working `ON DELETE CASCADE` FKs, seeds `CURATED_BLOCKED_WORDS`, and returns `false` on a second `runMigrationsAsync()` call (fast-path).
  - Migration `0007-cleanup-legacy-schema` drops a pre-existing `page_views` table and migrates a pre-existing `config.rotation_epoch` row into `config.epoch_date` without overwriting an existing `epoch_date`.
- [x] **Unit (`tests/unit/gameplay-store.test.ts` / `tests/unit/player-sync-store.test.ts`):**
  - Update or remove any test assertions that exercised the deleted `LEGACY_STATE_KEY` migration path.

### Visual & Mechanical Gate

- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
