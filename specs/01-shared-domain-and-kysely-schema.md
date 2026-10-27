# Spec 01: Shared Domain & Full Kysely DB Schema

Status: approved
Branch: spec/01-shared-domain-and-kysely-schema
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/packages/shared/src/`
- `/Users/erezac/Projects/sanakenno/server/db/schema.sql`
- `/Users/erezac/Projects/sanakenno/server/db/migrations/`

## 1. Objective

Establish the complete pure Finnish game domain in `@sanakenno/shared` and the full production-compatible SQLite schema in `@sanakenno/server` using Kysely, verified by unit and schema-parity integration tests.

## 2. Invariants & Non-Goals

- **100% SQLite Table & Column Parity:** A copy of production `sanakenno.db` from Sanakenno 1.0 must open cleanly in `@sanakenno/server` without data loss or column mismatches across all tables (`puzzles`, `blocked_words`, `achievements`, `page_views`, `combinations`, `suggestion_rejections`, `admins`, `sessions`, `admin_log`, `config`, `failed_guesses`, `word_finds`, `players`, `player_sessions`, `player_stats`, `player_puzzle_states`, `schema_migrations`).
- **Drop Legacy Mobile Abstractions:** Do **not** port `platform-types.ts` (archived iOS era).
- **Non-Goal:** Do not add new API endpoints or React components in this spec—keep it strictly to `@sanakenno/shared` and `packages/server/src/db/`.

## 3. Contract & Architecture

- **`@sanakenno/shared`:**
  - Port pure modules: `scoring.ts`, `hint-data.ts`, `stats.ts`, `sync-merge.ts`, `kotus.ts`, `share-text.ts`, `honeycomb-theme.ts`, `auth-types.ts`.
  - Add Zod schemas for core domain records (`StatsRecordSchema`, `PuzzleStateSchema`, `HintDataSchema`).
- **`@sanakenno/server/src/db/`:**
  - Expand `schema.ts` (`Database` Kysely interface) to cover all tables in 1.0 `schema.sql` + migrations.
  - Ensure `connection.ts` applies the baseline schema idempotently and supports both in-memory (`:memory:`) and file-backed SQLite databases with WAL mode and `foreign_keys = ON`.
  - Expand `seed.ts` to populate sample puzzles, words, and player stats for local testing.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit tests in `tests/unit/` cover Finnish word scoring, pangram detection, hint matrix generation, streak/rank distribution math, and conflict-free `mergeStatsRecord` / `mergePuzzleState`.
- [ ] Integration test `tests/integration/db-parity.test.ts` verifies that a database initialized from Sanakenno 1.0s `schema.sql` is queryable via Kysely across all tables with foreign-key cascades working.
- [ ] `pnpm run check:agent` passes with zero warnings or boundary violations.
