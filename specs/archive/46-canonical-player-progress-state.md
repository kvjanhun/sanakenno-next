# Spec 46: Canonical Player Progress State (Retire Dual `player_stats` Table)

Status: shipped
Branch: spec/46-canonical-player-progress-state

## 1. Objective

Make `player_puzzle_states` the single canonical database table for per-puzzle player progress and derive `StatsRecord` deterministically from it—halving sync database writes, eliminating `player_stats` vs `player_puzzle_states` drift, and removing redundant server/client stat-merging and backfill code.

## 2. Invariants & Non-Goals

### Invariants

- **Zero Wire Breaking Changes:** `GET /api/player/sync` (`SyncPayload`), `POST /api/player/sync/progress`, and `POST /api/player/auth/transfer/use` preserve their exact HTTP request and response contracts so existing PWA clients continue working seamlessly during rollout.
- **Zero Historical Player Data Loss:** Migration `0009-consolidate-player-stats-into-puzzle-states` migrates every existing `player_stats` row into `player_puzzle_states` before dropping `player_stats`:
  - Matching rows copy `date`, `is_daily`, `played_at_date`, and `elapsed_ms` (and if `revealed = 1`, snapshot the existing `player_stats` row into `frozen_stats_json`).
  - Historical orphan `player_stats` rows (slots with stats but no `player_puzzle_states` row, or whose stored `best_score` exceeds what `found_words` alone produces) preserve their exact stats in `frozen_stats_json` so no player's streak, achievements, or past scores ever regress.
- **Exact Spec 43 Revealed-Puzzle Freeze Invariant:**
  - When `revealed` transitions `0 → 1`: if `found_words.length > 0`, capture the current derived `StatsRecord` into `frozen_stats_json`; if `found_words.length === 0`, leave `frozen_stats_json = NULL`.
  - When `revealed = 1`: subsequent word finds still save to `found_words` if played, but `frozen_stats_json` is never created or mutated—preventing revealed puzzles from creating 0-word stats or advancing achievements/streaks.
- **Exact Daily Streak & Zero-Word Hint Invariants:** Zero-word hint unlocks (`found_words.length === 0`) never emit a `StatsRecord` and never advance streaks.

### Non-Goals

- Changing the `localStorage` key format for active puzzle state (`sanakenno_state_<slot>`) or changing achievements/streak calculation rules in `@sanakenno/shared`.
- Changing anonymous Bearer auth, 6-digit pairing codes, or Resend email transfer flows.

## 3. Contract & Architecture

### A. Shared Derivation Logic (`@sanakenno/shared`)

- **`packages/shared/src/stats.ts` (or `sync-merge.ts`):**
  - Add pure `deriveStatsRecordFromState(state, puzzleMeta)` that computes a `StatsRecord` (`best_rank`, `best_score`, `max_score`, `words_found`, `hints_used`, `elapsed_ms`, `longest_word`, `pangrams_found`, `best_no_hint_score`, `long_words_count`, `is_daily`, `played_at_date`, `date`) directly from canonical state fields + puzzle metadata (`letters`, `center`, `max_score`).
  - Update `SyncPuzzleState` / `mergePuzzleState` to merge `date`, `is_daily` (monotonic `||`), `played_at_date`, and `elapsed_ms` (monotonic `Math.max`) consistently.

### B. Database Schema & Migration (`@sanakenno/server`)

- **`packages/server/src/db/schema.ts` & `baseline-sql.ts`:**
  - Add columns to `PlayerPuzzleStatesTable` / `player_puzzle_states`:
    - `date TEXT DEFAULT NULL`
    - `is_daily INTEGER NOT NULL DEFAULT 0`
    - `played_at_date TEXT DEFAULT NULL`
    - `elapsed_ms INTEGER NOT NULL DEFAULT 0`
    - `frozen_stats_json TEXT DEFAULT NULL`
  - Remove `PlayerStatsTable`, `player_stats` DDL, and `idx_player_stats_player` from `schema.ts` and `baseline-sql.ts`.
- **`packages/server/src/db/async-migrations.ts`:**
  - Append `0009-consolidate-player-stats-into-puzzle-states`:
    1. Add the 5 new columns to `player_puzzle_states` via `ensureColumnAsync`.
    2. If `player_stats` table exists, read existing `player_stats` + `player_puzzle_states` rows and upsert metadata (`date`, `is_daily`, `played_at_date`, `elapsed_ms`, and `frozen_stats_json` when revealed or when orphan/legacy stats differ from derivable state) into `player_puzzle_states`.
    3. `DROP TABLE IF EXISTS player_stats`.

### C. Single-Table Sync Queries & Routes (`@sanakenno/server`)

- **`packages/server/src/features/player-sync/player-sync.routes.ts`, `player-sync.queries.ts`, `player-sync-bulk.queries.ts`:**
  - `POST /api/player/sync/progress`: performs a single read-merge-upsert against `player_puzzle_states` (capturing `frozen_stats_json` once if transitioning `revealed: false → true` with `found_words.length > 0`).
  - `GET /api/player/sync` (`fetchPlayerData`): reads `player_puzzle_states` + referenced `puzzles` metadata (`letters`, `center`, `max_score`) and derives `stats.records` (using `frozen_stats_json` if present, skipping `revealed = 1 && frozen_stats_json IS NULL`, and skipping `found_words.length === 0 && frozen_stats_json IS NULL`).
  - `bulkUpsertLocalData` (used by `/auth/transfer/use`): upserts only `player_puzzle_states` (absorbing incoming client `stats` metadata like `date`/`is_daily`/`played_at_date`/`elapsed_ms` or orphan records into `frozen_stats_json`), deleting duplicated `player_stats` chunked upsert and `sanitizeAndMergeStatsRecord` / `mergeAndStoreStatsRecord` / `readStatsRecord` / `deriveStatsFromProgress`.

### D. Web Client Cleanup (`@sanakenno/web`)

- **`packages/web/src/features/modals/backfillStats.ts` & `StatsModal.tsx`:**
  - Delete `packages/web/src/features/modals/backfillStats.ts` (`backfillNoHintStats`) once server sync always derives complete `best_no_hint_score`, `long_words_count`, and `longest_word` from canonical puzzle states (and `recordLocalStatsUpdate` already records all three locally on every word find).

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Unit / Domain (`tests/unit/shared-domain.test.ts`):**
  - `deriveStatsRecordFromState` computes exact rank, score, pangrams, longest word, long words count, `best_no_hint_score`, and `is_daily` across unassisted, hinted, and revealed states.
- [x] **Integration (`tests/integration/db-migrations.test.ts`):**
  - Migration `0009` preserves (a) matched `player_stats` + `player_puzzle_states` rows, (b) orphan historical `player_stats` rows with no state row, and (c) revealed puzzle rows with frozen pre-reveal stats, then drops `player_stats`.
- [x] **Integration (`tests/integration/player-sync.test.ts`, `player-sync-hardening.test.ts`, `player-sync-revealed.test.ts`, `player-transfer-tickets.test.ts`):**
  - All existing sync, hardening, transfer-merge, streak-integrity, and revealed-freeze tests pass identically against the single-table implementation.
  - Transitioning `revealed: false → true` after finding words freezes derived stats permanently even if more words are pushed later; revealing at 0 words emits no `StatsRecord`.

### Visual & Mechanical Gate

- [x] **Visual Inspection (`pnpm run screenshot stats archive`):** Confirm `StatsModal` and `ArchiveModal` render identically at 390px and 1280px after removing `backfillStats.ts`.
- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
