# Spec 10: Archive Performance & Cache Optimization

Status: shipped
Branch: spec/10-archive-performance-and-cache-optimization

## 1. Objective

Eliminate the multi-second hang when opening ArchiveModal and prevent memory bloat by persisting `max_score` in the `puzzles` table, serving `GET /api/archive` via a single batch SQLite query without full puzzle wordlist scans, and constraining `_puzzleCache` to an LRU of actively played puzzles.

## 2. Invariants & Non-Goals

- **Slot vs Display Number:** All cycle positions and display numbers must continue to be derived from 1-based indices in `getActiveSlots(db)` — never raw slot arithmetic.
- **API Contract Parity:** `ArchiveResponseSchema` shape (`date`, `puzzle_number`, `display_number`, `letters`, `center`, `is_today`, `max_score`) remains 100% byte-for-byte identical.
- **Cold Start Non-Goal:** As confirmed by the user, Cloud Run cold start remains on `--min-instances 0` with acceptable startup latency. No infra changes to min-instances.
- **Litestream Parity:** SQLite schema migration must be forward-only and safe under WAL mode and Litestream replication.

## 3. Contract & Architecture

### Database Migration & Schema

- Update `packages/server/src/db/schema.ts`:
  - `PuzzlesTable`: add `max_score: Generated<number | null>`.
- Add migration `0002-add-puzzle-max-score` in `packages/server/src/db/baseline-sql.ts`:
  - Add column `max_score INTEGER` to `puzzles`.
  - Backfill any rows where `max_score IS NULL` by computing max score once on startup/migration.
- Update `packages/server/src/db/seed.ts` and `admin-puzzles.queries.ts` to populate `max_score` when puzzles are created or updated.

### Server Queries & Archive Route

- In `packages/server/src/features/puzzle/puzzle.queries.ts`:
  - Add `getArchiveMetadata(db, todayHelsinki, days)` that reads all active puzzles in a single query and resolves display numbers and dates without calling `computePuzzle()` or `hashWord()`.
  - Fall back to calculating `max_score` on-the-fly only if a legacy row lacks it, updating the row opportunistically.
- In `packages/server/src/features/puzzle/archive.routes.ts`:
  - Use `getArchiveMetadata` instead of the N-iteration `for` loop calling `getFullPuzzleForDate`.
  - Response time drops from ~1.1s (local) / ~4-6s (Cloud Run) down to <5ms.
- In `packages/server/src/features/puzzle/wordlist.ts`:
  - Implement a bounded LRU eviction policy for `_puzzleCache` (max 10 puzzles) so historical games do not remain in RAM indefinitely.

## 4. Acceptance Criteria (Test Catalog)

- [x] **Migration & Schema:** `0002-add-puzzle-max-score` successfully adds column and backfills active puzzles.
- [x] **Archive Batch Query:** `GET /api/archive?all=true` returns the exact same payload as before, but without populating `_puzzleCache` with all 300+ puzzles.
- [x] **Cache Bounding:** Accessing more than 10 different puzzles via `/api/puzzle/:number` evicts the oldest entries from `_puzzleCache`.
- [x] **Full Mechanical Gate:** `pnpm run check:agent` passes 100% (types, lint, architecture, unit & integration tests, production build).
