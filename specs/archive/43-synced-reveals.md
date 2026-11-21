# Spec 43: Cross-Device Revealed Puzzle Sync

Status: shipped
Branch: spec/43-synced-reveals

## 1. Objective

Sync revealed-answer puzzle flags (`revealed_<slot>`) monotonically across paired devices so revealing answers on one device disables stats and achievements for that puzzle everywhere without polluting `player_stats` for unplayed puzzles.

## 2. Invariants & Non-Goals

### Invariants

- **Monotonic Reveal & Stats Freeze:** Once `revealed` is `true` for a `(player_id, puzzle_number)` pair, it never flips back to `false` across sync merges or device transfers. Syncing `revealed: true` persists `player_puzzle_states.revealed = 1` **without** inserting a 0-word `player_stats` record or mutating existing `player_stats` for that slot.
- **SQLite & Turso (libSQL) Migration Parity:** The `player_puzzle_states.revealed` column is added via an idempotent `ensureColumnAsync` migration (`0006-add-player-puzzle-state-revealed`) in `packages/server/src/db/async-migrations.ts` and reflected in `BASELINE_STATEMENTS` and `schema.ts`.
- **Single-Query & Multi-Row Transfer Parity:** Both `/api/player/sync/progress` (`player-sync.queries.ts`) and device transfer `/api/player/auth/transfer/use` (`player-sync-bulk.queries.ts`) preserve `revealed` monotonically.

### Non-Goals

- Offline 7-day puzzle prefetching or any offline download UI in `SettingsModal`.
- Retroactively deleting historical `player_stats` rows that existed before a reveal occurred (only freezing further stat updates and preventing 0-word rows).

## 3. Contract & Architecture

### A. Shared Schemas & Merge Logic (`@sanakenno/shared`)

- In `packages/shared/src/auth-types.ts`, `packages/shared/src/schemas/domain.ts`, and `packages/shared/src/schemas/player-sync.ts`:
  - Add optional `revealed?: boolean` (`z.boolean().optional().default(false)`) to `SyncPuzzleState`, `PuzzleStateSchema`, and `SyncProgressPayloadSchema`.
- In `packages/shared/src/sync-merge.ts`:
  - In `mergePuzzleState`, merge monotonically: `revealed: Boolean(local.revealed || server.revealed)`.
  - In `isPuzzleStateBetterThanServer`, return `true` when `Boolean(local.revealed) && !server.revealed`.

### B. Database & Server Sync (`@sanakenno/server`)

- **Schema & Migration (`schema.ts`, `baseline-sql.ts`, `async-migrations.ts`):**
  - Add `revealed: Generated<number>` (`INTEGER NOT NULL DEFAULT 0`) to `PlayerPuzzleStatesTable` in `packages/server/src/db/schema.ts` and `player_puzzle_states` in `packages/server/src/db/baseline-sql.ts`.
  - Append migration `0006-add-player-puzzle-state-revealed` to `ASYNC_MIGRATIONS` in `packages/server/src/db/async-migrations.ts` using `ensureColumnAsync(db, 'player_puzzle_states', 'revealed', 'INTEGER NOT NULL DEFAULT 0')`.
- **Sync Queries & Bulk Upsert (`player-sync.queries.ts`, `player-sync-bulk.queries.ts`):**
  - Read, preserve, and return `revealed: Boolean(row.revealed)` in `readPuzzleState`, `mergeAndStorePuzzleState`, `fetchPlayerData`, and `bulkUpsertLocalData` (updating `revealed` on conflict in the multi-row upsert).
  - Keep `player-sync.queries.ts` and `player-sync-bulk.queries.ts` under 500 lines.
- **Sync Route Guard (`player-sync.routes.ts`):**
  - In `POST /api/player/sync/progress`, skip `deriveStatsFromProgress` / `mergeAndStoreStatsRecord` when `mergedState.revealed` is true (as well as when `mergedState.found_words.length === 0 && existingStats === undefined`), ensuring revealed puzzles never create or advance `player_stats`.

### C. Web Reveal Sync (`@sanakenno/web`)

- In `packages/web/src/features/player-sync/sync-reconcile.ts`:
  - Update `gatherLocalData()` to enumerate `revealed_<slot>` keys in `localStorage` in addition to `stats.records` and `sanakenno_state_<slot>`, emitting `revealed: true` even when no `sanakenno_state_<slot>` exists for that slot (preserving existing `found_words` if present, or empty state if unplayed).
  - Update `pullAndMergeData()` to call `setRawStorage(revealedKey(serverState.puzzle_number), 'true')` whenever `serverState.revealed` is true.
  - Update `pushLocalDataAheadOfServer()` to include `revealed: localState?.revealed`.
- In `packages/web/src/features/player-sync/useAuthStore.ts`:
  - Add `syncRevealedPuzzle(puzzleNumber: number)` that pushes `revealed: true` (preserving any existing local `foundWords`/state for that slot) via `POST /api/player/sync/progress` when logged in.
- In `packages/web/src/features/modals/PuzzleWordsModal.tsx`:
  - Call `void useAuthStore.getState().syncRevealedPuzzle(puzzleNumber)` alongside `setRawStorage(revealedKey(puzzleNumber), 'true')` when answers are loaded and revealed.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Shared (`tests/unit/shared-domain.test.ts`):**
  - `mergePuzzleState` and `isPuzzleStateBetterThanServer` merge `revealed` monotonically (`false || true === true`).
- [x] **Integration (`tests/integration/player-sync-revealed.test.ts`):**
  - Migration `0006-add-player-puzzle-state-revealed` adds `revealed` cleanly on existing DBs.
  - `POST /api/player/sync/progress` with `revealed: true` and `found_words: []` persists `player_puzzle_states.revealed = 1` across `GET /api/player/sync` without creating a 0-word `player_stats` record, and subsequent progress pushes for a revealed puzzle do not mutate `player_stats`.
  - Device transfer (`/api/player/auth/transfer/use`) preserves `revealed: true` via `bulkUpsertLocalData`.
- [x] **Web Sync (`tests/unit/sync-reconcile.test.ts`, `tests/unit/Modals.test.tsx`, `tests/unit/hint-sync-integrity.test.ts`):**
  - `gatherLocalData`, `pullAndMergeData`, and `pushLocalDataAheadOfServer` round-trip `revealed_<slot>` even for unplayed puzzles, and `PuzzleWordsModal` triggers `syncRevealedPuzzle`.

### Visual & Mechanical Gate

- [x] **Visual Inspection (`pnpm run screenshot`):** Confirm baseline views remain clean (no UI layout changes in this slice).
- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
