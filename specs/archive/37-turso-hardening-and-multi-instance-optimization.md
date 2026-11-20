# Spec 37: Turso Hardening, Round-Trip Reduction & Multi-Instance Safety

Status: shipped
Branch: spec/37-turso-hardening-and-multi-instance-optimization

## 1. Objective

Harden the managed Turso (`@libsql/client`) database layer and server query paths for low-latency remote Hrana execution and multi-instance Cloud Run (`--max-instances 3`) correctness—eliminating wasted round-trips, `trx`-triggered cache wipes, cross-instance cache staleness, dev auto-seeding against remote Turso, and single-use transfer ticket races.

## 2. Invariants & Non-Goals

- **Preserved Invariants:**
  - All 18 SQLite/libSQL tables, `slot` vs `display_number` numbering, `Europe/Helsinki` midnight rotation, and monotonic player sync merge semantics remain unchanged.
  - Both engines (`kysely-sqlite` for local dev/Vitest and `kysely-libsql` for Turso) remain supported with identical behavioral contracts.
  - Route handlers (`*.routes.ts`) continue to own `runImmediateTransactionWithRetry()` transaction boundaries; query modules (`*.queries.ts`) remain composable over `db` or `trx` and never open nested Kysely transactions.
  - All modified/new files stay under the 500-line ceiling enforced by `tests/architecture.test.ts`.
  - No frontend/UI changes (`packages/web` is untouched).
- **Explicit Non-Goals:**
  - Removing `better-sqlite3` or retiring sync migrations in `baseline-sql.ts` (keep dual-engine local dev/tests intact in this slice).
  - Moving in-memory rate limiters to Turso (per-instance rate limiting is acceptable at `--max-instances 3`).
  - Changing the SQLite schema or adding new migrations.

## 3. Contract & Architecture

### 3.1 LibSQL Dialect, Connection Lifecycle & Retry Policy (`packages/server/src/db/`)

- **`libsql-dialect.ts`:**
  - Remove `await this.#tx.execute('PRAGMA foreign_keys = ON')` from `LibsqlConnection.beginTransaction()`. SQLite treats `PRAGMA foreign_keys` as a no-op inside a transaction, Turso enforces foreign keys by default, and `@libsql/client`'s `HranaTransaction` pipelines `BEGIN IMMEDIATE` with the first real statement—so removing this eliminates one wasted network RTT per write transaction.
  - Add defensive `finally { tx.close(); }` cleanup in `commitTransaction()` and `rollbackTransaction()`, plus cleanup of any lingering active `#tx` in `LibsqlDriver.releaseConnection()`, so interactive Hrana write streams can never leak even under abnormal connection release.
- **`retry.ts` & `connection.ts`:**
  - Extract `isSqliteBusyError()` and `runImmediateTransactionWithRetry()` into `packages/server/src/db/retry.ts` (re-exported from `connection.ts` so existing callers remain unchanged) to avoid a circular ESM import between `connection.ts` and `async-migrations.ts`.
  - Expand `isSqliteBusyError()` to recognize definite pre-commit transient contention/stream-expiry errors (`SQLITE_BUSY`, `SQLITE_BUSY_SNAPSHOT`, `SQLITE_BUSY_TIMEOUT`, `SQLITE_LOCKED`, `STREAM_EXPIRED`, `HRANA_STREAM_EXPIRED`, and `database is locked`). Do **not** retry `HRANA_CLOSED_ERROR` generically, as a connection drop after `COMMIT` would risk double-applying non-idempotent writes (`achievements`, `word_finds`, `failed_guesses`, ticket redemption).
  - Tune default retry options in `runImmediateTransactionWithRetry()` for remote RTTs (`maxRetries: 4`, `retryDelayMs: 50`) while keeping overrides supported for fast unit tests.
  - Remove the redundant `await ensureForeignKeysOn(db)` call in `initDb()` for the `kysely-libsql` branch (relying on `LibsqlDriver.init()` on first query).
- **`async-migrations.ts`:**
  - Wrap each per-migration transaction in `runMigrationsAsync()` with `runImmediateTransactionWithRetry()` (imported from `./retry.js`) and return the `boolean` applied flag from the transaction callback rather than mutating outer state across retries, so simultaneous Cloud Run cold starts during a future migration do not fail on `SQLITE_BUSY`.
- **`packages/server/src/index.ts` & `packages/server/src/db/seed.ts`:**
  - Guard `ensureBootSeed(db, env, engine = 'kysely-sqlite')` so non-production auto-seeding only runs for local `kysely-sqlite` (never querying or auto-seeding a remote `kysely-libsql` database unless `SEED_ON_BOOT === 'true'`). Pass `engine` from `index.ts` main boot.
  - Update `seed.ts` CLI entrypoint to use `initDb(process.env)` + `checkpointAndDestroyDb(db, engine)` and `typeof process.argv[1] === 'string' && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)` so `pnpm run db:seed` works reliably with both local SQLite and Turso.

### 3.2 Remote Round-Trip & N+1 Reduction (`packages/server/src/features/`)

- **`POST /api/player/sync/progress` (`player-sync.routes.ts`, `player-sync.queries.ts`):**
  - Resolve `getFullPuzzleBySlot(db, payload.puzzle_number)` **once before** opening `runImmediateTransactionWithRetry()`.
  - Allow `mergeAndStorePuzzleState()`, `deriveStatsFromProgress()`, and `mergeAndStoreStatsRecord()` to accept an optional pre-resolved `FullPuzzleData | null` parameter (falling back to `getFullPuzzleBySlot()` only when omitted) so the write transaction never repeats puzzle lookups.
- **`POST /api/player/auth/transfer/use` (`player-sync-bulk.queries.ts`, `player-sync.queries.ts`, `player-auth.routes.ts`):**
  - Extract bulk sync helpers into `packages/server/src/features/player-sync/player-sync-bulk.queries.ts` (re-exporting `bulkUpsertLocalData` from `player-sync.queries.ts`) to keep every file well under the 500-line ceiling.
  - Refactor `bulkUpsertLocalData()` from O(N) sequential read+write loops into bounded O(1)/chunked queries:
    - Pre-resolve unique referenced puzzle slots **outside** the write transaction using **2 parallel queries** (`SELECT slot, letters, center, max_score FROM puzzles WHERE slot IN (...) AND is_active = 1` + `getBlockedWords(db)`), computing sanitization metadata in memory without polluting the 10-entry `_puzzleCache`.
    - Inside the write transaction, fetch existing `player_stats` and `player_puzzle_states` for `playerId` in **2 bulk `SELECT` queries** (`WHERE player_id = ?`), compute all monotonic merges in memory, and persist updates via **chunked multi-row `INSERT ... ON CONFLICT(player_id, puzzle_number) DO UPDATE`** (e.g., 40–50 rows per chunk to stay well under SQLite bind parameter limits).
- **`GET /api/player/sync` (`player-sync.queries.ts`):**
  - Execute the 3 independent `SELECT`s in `fetchPlayerData()` (`player_stats`, `player_puzzle_states`, `readPlayerPreferences`) concurrently with `Promise.all()`.
- **`GET /api/health` (`health.routes.ts`, `puzzle.queries.ts`):**
  - Derive `total_puzzles` and `days_remaining` from a single `Promise.all([getActiveSlots(db), getEpochDate(db)])` pair via a pure `computeDaysRemainingInCycle()` helper (also reused by `getDaysRemainingInCycle()`), eliminating the redundant `countActivePuzzles()` and duplicate `getActiveSlots()` round-trips.
- **Hot public read & telemetry paths (`puzzle.queries.ts`, `puzzle.routes.ts`, `telemetry.routes.ts`):**
  - Parallelize independent `getActiveSlots(db)` / `activeRows` and `getEpochDate(db)` queries with `Promise.all()` in `getPuzzleSlotForDate()`, `getSlotScheduleRelation()`, and `getArchiveMetadata()`.
  - Allow `getFullPuzzleBySlot()` to accept an optional pre-fetched `activeSlots?: number[]` so `getFullPuzzleForDate()` and `GET /api/puzzle/:number` do not query `getActiveSlots()` twice.
  - Remove the redundant `isActivePuzzleSlot()` pre-check before `getFullPuzzleBySlot()` in `POST /api/word-find`, preserving the exact `400` Finnish error messages (`Valittua peliä ei löydy tai se ei ole aktiivinen` when `puzzleData === null`, `Sana ei kuulu peliin` when the word is not in `puzzleData.words`).
  - Collapse the two sequential `getPuzzleBySlot()` reads in `swapPuzzles()` (`admin-puzzles.queries.ts`) into a single `WHERE slot IN (slotA, slotB)` query and remove the stale negative-slot comment (atomicity is already owned by `admin-puzzles.routes.ts`).

### 3.3 Multi-Instance Cache Correctness & Atomic Ticket Redemption (`packages/server/src/features/`)

- **Transaction-safe & cross-instance valid `puzzleCache` (`puzzle.queries.ts`, `wordlist.ts`):**
  - Guard `syncDbInstanceCache(db)` with `if (db.isTransaction) return;` so passing a Kysely `Transaction` (`trx !== db`) never wipes `_puzzleCache`.
  - Validate cached entries in `getFullPuzzleBySlot()` against `row.letters` and `row.center` (normalized), not just `display_number` and `total_puzzles`, giving instant cross-instance invalidation for admin puzzle edits, swaps, and center changes with zero extra queries.
  - Attach a short TTL (60s default, configurable/overridable for deterministic tests) to cached entries in `wordlist.ts` so cross-instance `blocked_words` changes propagate automatically without adding a `blocked_words` query on every cache hit.
- **Atomic single-use transfer ticket redemption (`player-auth.routes.ts`, `player-auth.queries.ts`):**
  - Keep a fast-fail read check on `rawToken` before bulk puzzle pre-resolution so unauthenticated invalid/expired/used tokens never trigger bulk puzzle reads.
  - Update `markTransferTicketUsed()` to atomically claim an unused, unexpired ticket with `.where('id', '=', ticketId).where('used_at', 'is', null)` (plus expiry verification inside `runImmediateTransactionWithRetry()`) and return a `boolean` (`Number(res.numUpdatedRows) > 0`). If a concurrent request already redeemed or expired the ticket, roll back the transaction cleanly and return `400` (`Tunniste on jo käytetty` or `Tunniste on vanhentunut`).

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **LibSQL Dialect & Lifecycle (`tests/integration/libsql-dialect.test.ts`):**
  - Verify `LibsqlConnection.beginTransaction()` does **not** execute `PRAGMA foreign_keys = ON` inside the transaction.
  - Verify `tx.close()` is invoked when `commit()`, `rollback()`, or abnormal `releaseConnection()` occurs.
  - Verify `runImmediateTransactionWithRetry()` retries on pre-commit libSQL/Hrana transient error codes (`SQLITE_BUSY_TIMEOUT`, `SQLITE_LOCKED`, `HRANA_STREAM_EXPIRED`), succeeds once cleared, and does **not** blindly retry `HRANA_CLOSED_ERROR`.
- [x] **Boot Seed Guard (`tests/integration/server-lifecycle.test.ts`):**
  - Verify `ensureBootSeed(db, { NODE_ENV: 'development' }, 'kysely-libsql')` does **not** auto-seed an empty `kysely-libsql` database unless `SEED_ON_BOOT === 'true'`.
- [x] **Sync, Transfer & Round-Trip Reduction (`tests/integration/player-sync.test.ts`, `tests/integration/player-transfer-tickets.test.ts`):**
  - Verify `bulkUpsertLocalData()` merges multiple stats and puzzle states monotonically (including conflict updates and inserts) while issuing bounded bulk reads/writes rather than O(N) per-row queries.
  - Verify concurrent `/api/player/auth/transfer/use` requests with the same single-use ticket allow exactly one redemption and return `400` (`Tunniste on jo käytetty`) for the duplicate without mutating player data or creating an extra session.
- [x] **Multi-Instance Cache & Transaction Safety (`tests/integration/puzzle-rpc.test.ts`):**
  - Verify `getFullPuzzleBySlot()` invalidates and recomputes when `letters` or `center` changes in the database without a local `invalidatePuzzleCache()` call (simulating a cross-instance admin edit).
  - Verify `_puzzleCache` entries expire and recompute against updated `blocked_words` after TTL expiry without calling `invalidatePuzzleCache()`.
  - Verify calling `getFullPuzzleBySlot(trx, slot)` inside a transaction does **not** wipe `_puzzleCache` for subsequent `db` calls.
- [x] **Health & Telemetry Parity (`tests/integration/puzzle-archive.test.ts`, `tests/integration/telemetry.test.ts`):**
  - Verify `GET /api/health` and `POST /api/word-find` preserve exact response payloads and Finnish error messages with reduced query counts.

### Mechanical Gate

- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
- [x] **Docs:** Update `PROJECT_MAP.md` (fix table count to 18 tables, note TTL/content-validated puzzle cache, `db/retry.ts`, and `player-sync-bulk.queries.ts`).
