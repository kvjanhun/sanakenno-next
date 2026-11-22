# Spec 45: Precomputed Puzzle Payloads & Elimination of Runtime Wordlist Cache Drift

Status: shipped
Branch: spec/45-precomputed-puzzle-payloads

## 1. Objective

Persist each puzzle's precomputed payload (`words`, `word_hashes`, `max_score`, `hint_data`) directly in `puzzles.computed_data` on write so player reads, archive/schedule assembly, and bulk device sync never scan `kotus_words.txt` at runtime—eliminating the in-memory LRU/TTL cache and cross-instance staleness across Cloud Run containers.

## 2. Invariants & Non-Goals

### Invariants

- **Exact API Payload Parity:** `GET /api/puzzle`, `GET /api/puzzle/:number`, `GET /api/puzzle/:number/words`, `GET /api/archive`, and `GET /api/admin/schedule` return the exact same JSON shapes and values as before.
- **Immediate Multi-Instance Consistency:** Adding/removing a blocked word (`POST /admin/block`, `DELETE /admin/block/:id`), saving a puzzle, changing a center letter, or swapping slots atomically updates `puzzles.computed_data` in Turso so all Cloud Run instances observe the change immediately with zero 60-second stale window.
- **Fast, Non-Blocking Turso Migration:** Migration `0008-add-puzzle-computed-data` only adds the nullable `computed_data TEXT` column (`ALTER TABLE puzzles ADD COLUMN computed_data TEXT`) so it completes in milliseconds on Turso without locking the database; existing `NULL` rows populate lazily on first read (write-through) and eagerly on any admin mutation.
- **Hyphen & Lemma Invariants Preserved:** `computed_data` stores canonical Kotus words and normalized SHA-256 `word_hashes` produced by `computePuzzle()`.

### Non-Goals

- Changing `kotus_words.txt` filtering, puzzle scoring rules, or the admin suggestion/combinations engine (`computePuzzle` remains in `wordlist.ts` for admin curation, preview, and write-time generation).
- Adding external caching layers (Redis/CDN) or changing `GET /api/archive` response shape.

## 3. Contract & Architecture

### A. Database Schema & Migration (`@sanakenno/server`)

- **`packages/server/src/db/schema.ts` & `baseline-sql.ts`:**
  - Add `computed_data: Generated<string | null>` (`TEXT DEFAULT NULL`) to `PuzzlesTable` and `puzzles` DDL.
- **`packages/server/src/db/async-migrations.ts`:**
  - Append `0008-add-puzzle-computed-data`: `ensureColumnAsync(db, 'puzzles', 'computed_data', 'TEXT DEFAULT NULL')`.
- **`packages/server/src/db/seed.ts`:**
  - Persist `computed_data: JSON.stringify(p1)` / `JSON.stringify(p2)` alongside `max_score` when seeding puzzles.

### B. Write-Time Precomputation (`admin-puzzles.queries.ts`)

- Serialize `PuzzleData` (`{ words, word_hashes, max_score, hint_data }`) into `puzzles.computed_data` on every puzzle mutation:
  - `insertOrUpdatePuzzle`: writes `max_score` and `computed_data`.
  - `updatePuzzleCenter`: writes `max_score` and `computed_data`.
  - `swapPuzzles`: swaps `computed_data` alongside `letters`, `center`, and `max_score`.
  - Rename/update `recomputeMaxScoresForAffectedWord` → `recomputeAffectedPuzzlesForWord`: for every active puzzle whose `(letters, center)` can form the newly blocked/unblocked word, recompute `PuzzleData` and update both `max_score` and `computed_data` (even if `max_score` happens to stay equal, `words`/`hint_data` changed).

### C. Read-Path Simplification & Cache Removal (`wordlist.ts`, `puzzle.queries.ts`, `player-sync-bulk.queries.ts`)

- **`packages/server/src/features/puzzle/wordlist.ts`:**
  - Remove the in-memory puzzle LRU cache (`_puzzleCache`, `DEFAULT_PUZZLE_CACHE_TTL_MS`, `getCachedPuzzle`, `setCachedPuzzle`, `invalidatePuzzleCache`, `setPuzzleCacheTtlMs`, `getPuzzleCacheSize`).
  - Add a small pure `parseComputedPuzzleData(raw: string | null | undefined): PuzzleData | null` validator/parser helper.
- **`packages/server/src/features/puzzle/puzzle.queries.ts`:**
  - Remove `_lastDb` and `syncDbInstanceCache()`.
  - In `getFullPuzzleBySlot`: select `computed_data` alongside `slot, letters, center, max_score`. If `parseComputedPuzzleData(row.computed_data)` succeeds, construct `FullPuzzleData` directly with **zero** `blocked_words` query and **zero** `computePuzzle()` call. Only when `computed_data` is `NULL`/invalid, fall back to `getBlockedWords` + `computePuzzle` and write `computed_data` + `max_score` back to `puzzles` (write-through).
- **`packages/server/src/features/admin-puzzles/admin-puzzles.queries.ts`:**
  - In `buildAdminSchedule`: select `computed_data` from `puzzles` and read `word_count`, `max_score`, `pangram_count` directly from parsed `computed_data`, falling back to `computePuzzle` only for unpopulated rows.
- **`packages/server/src/features/player-sync/player-sync-bulk.queries.ts`:**
  - In `preloadBulkPuzzleMeta`: select `computed_data` from `puzzles` and derive `BulkPuzzleMeta` directly from parsed `computed_data`, querying `blocked_words` + running `computePuzzle` only if any referenced slot has `computed_data IS NULL`.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Integration (`tests/integration/puzzle-rpc.test.ts` & `tests/integration/puzzle-archive.test.ts`):**
  - Reading a puzzle with populated `computed_data` serves `/api/puzzle` and `/api/puzzle/:number/words` without invoking `computePuzzle` or reading `blocked_words` (proven by clearing the in-memory wordlist after seeding/writing and verifying reads still succeed with exact words/hashes/hints).
  - Reading a legacy row with `computed_data = NULL` lazily computes, returns exact data, and persists `computed_data` so subsequent reads use the stored snapshot.
- [x] **Integration (`tests/integration/admin-puzzles.test.ts`):**
  - Creating/updating a puzzle, changing center, swapping slots, and blocking/unblocking a word all update `puzzles.computed_data` atomically and immediately affect subsequent `/api/puzzle` reads with no cache invalidation step required.
- [x] **Unit (`tests/unit/wordlist.test.ts`):**
  - Remove deleted LRU/TTL cache tests; add tests for `parseComputedPuzzleData` handling valid snapshots, `null`, and malformed JSON.

### Visual & Mechanical Gate

- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
