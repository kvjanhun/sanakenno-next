# Spec 38: Hint Activation Sync, Stats & Gameplay State Integrity

Status: shipped
Branch: spec/38-hint-activation-sync

## 1. Objective

Sync hint activations (`hints_unlocked`, `score_before_hints`, `best_no_hint_score`) immediately when a hint is unlocked while closing related gameplay, stats, and sync-queue integrity bugs (0-word streak pollution, archive `is_daily` promotion on partial sync, `flushPendingSync` race conditions, midnight date drift, revealed-puzzle stats leakage, and `submitWord` async races).

## 2. Invariants & Non-Goals

- **No-Hint Integrity:** Unlocking the first visible hint on a puzzle is a one-way transition that locks `score_before_hints` to the player's current `score` and ends the no-hint run across devices.
- **Zero-Word Hint Unlock Safety:** Unlocking a hint before finding any word (`found_words.length === 0`) MUST persist and sync `player_puzzle_states` (`hints_unlocked`, `score_before_hints: 0`) so other devices know hints were used, but MUST NOT create a 0-word `StatsRecord` or increment the daily streak ("Putki"), played-puzzle count, or average-completion denominator.
- **Sync Coalescing & Ordering:** Rapidly unlocking multiple hints coalesces via `syncProgressDebounced` (1.5 s); the *first* hint unlock on a puzzle flushes immediately via `flushPendingSync()`. An in-flight flush MUST never delete a newer payload queued for the same slot while the request was in flight, and concurrent `flushPendingSync()` calls MUST coalesce instead of sending duplicate parallel requests.
- **Revealed-Puzzle Isolation:** Once a puzzle's answers have been revealed (`revealed_<slot> === 'true'`), subsequent play on that puzzle MUST NOT update local stats, trigger `backfillNoHintStats`, export post-reveal `sanakenno_state_<slot>` via `gatherLocalData()`, or push progress/telemetry to the server. Marking `revealed_<slot>` only happens once answers actually load (`data` present), never on an offline/network error.
- **Offline / Unauthenticated Safety:** Local persistence (`saveState()`) always runs synchronously first; network failures or missing auth tokens never block or revert local hint state.
- **Non-Goals:** No DB schema changes or new API routes. No visual/layout/CSS redesigns (removing the two hidden `tier-tab-3`/`tier-tab-4` DOM buttons has zero visual effect).

## 3. Contract & Architecture

- **Shared Domain (`@sanakenno/shared`):**
  - `packages/shared/src/stats.ts` & `packages/shared/src/sync-merge.ts`:
    - Update `computeStreak` to require `record.words_found > 0` alongside `isDailyRecord(record)` so 0-word records can never advance or create a daily streak.
    - Add an asymmetric `mergeIsDaily(existing, incoming)` helper used by both `updateStatsRecord` and `mergeStatsRecord` (and respected by server `sanitizeAndMergeStatsRecord` in `player-sync-bulk.queries.ts:135`):
      - Return `true` if `existing.is_daily === true || incoming.is_daily === true`.
      - Return `true` if `existing.is_daily === undefined && isDailyRecord(existing)` (preserves legacy daily records when later updated via archive play).
      - Return `incoming.played_at_date === incoming.date` if `incoming.is_daily === undefined && incoming.played_at_date !== undefined`.
      - Otherwise return `false` (so partial sync payloads with `{ is_daily: undefined, played_at_date: undefined }` never falsely promote an explicit archive record `existing.is_daily === false` to `true`).
    - Extract a shared field-merge helper used by both `updateStatsRecord` and `mergeStatsRecord` so both preserve `is_daily` consistently and upgrade `max_score` via `Math.max(existing.max_score, incoming.max_score)`.
- **Backend Sync Guard (`@sanakenno/server`):**
  - `packages/server/src/features/player-sync/player-sync.routes.ts`, `player-sync.queries.ts`, & `player-sync-bulk.queries.ts`:
    - In `POST /api/player/sync/progress`: always merge and persist `player_puzzle_states`. When `mergedState.found_words.length > 0`, proceed directly to `deriveStatsFromProgress` + `mergeAndStoreStatsRecord` (zero extra DB round-trip on the normal word-find path). When `mergedState.found_words.length === 0`, check `readStatsRecord(trx, player.playerId, payload.puzzle_number)` and only derive/update stats if a `player_stats` row already exists (updating `hints_used` / `best_no_hint_score` without fabricating 0-word stats rows).
    - Guard `JSON.parse` on `found_words` and `hints_unlocked` in `readPuzzleState`, `fetchPlayerData`, and `bulkUpsertLocalData` with a shared `parseStringArray(raw)` helper (validating `Array.isArray` and filtering string elements, falling back to `[]` on corrupt JSON) so one corrupt row never breaks sync for a player.
- **Frontend Gameplay, Sync & Modals (`@sanakenno/web`):**
  - `packages/web/src/features/gameplay/gameplay-effects.ts`:
    - Extract a shared `buildSyncPayload` helper (using `viewingDate ?? puzzle.date ?? getHelsinkiDateString()` consistently for both `recordLocalStatsUpdate` and `syncProgressDebounced`, eliminating midnight drift) and add `handleHintUnlockedEffects`.
    - When `isPuzzleRevealed(puzzle.puzzle_number)` is true, skip `recordLocalStatsUpdate`, `syncProgressDebounced`, `postWordFind`, and `postAchievement` so revealed puzzles never leak back into local or server stats.
    - In `handleHintUnlockedEffects`: update local stats via `recordLocalStatsUpdate` only when `foundWords.size > 0`; always queue `syncProgressDebounced(syncPayload)` (unless revealed); flush immediately via `void useAuthStore.getState().flushPendingSync()` when `wasFirstHint` is true.
  - `packages/web/src/features/gameplay/useGameStore.ts`:
    - In `unlockHint(id)`: guard `if (!s.puzzle || !isVisibleHintId(id) || s.hintsUnlocked.has(id)) return;` as a strict no-op before calling `setHintsHidden(false)`, mutating state, `saveState()`, or `handleHintUnlockedEffects`. On a valid new unlock, set `hintsHidden(false)`, update `hintsUnlocked` (and `scoreBeforeHints` if first), call `get().saveState()`, and invoke `handleHintUnlockedEffects`.
    - In `submitWord()`: immediately after `await hashWord(normalized)`, re-read fresh store state (`const fresh = get()`) and bail silently before `wordHashSet`/`postFailedGuess`/`rejectWord` if `!fresh.puzzle || fresh.puzzle.puzzle_number !== puzzle.puzzle_number || fresh.foundWords.has(normalized)`. Align `postFailedGuess` to use `viewingDate ?? fresh.puzzle.date ?? getHelsinkiDateString()` and skip it when `isPuzzleRevealed(fresh.puzzle.puzzle_number)`.
  - `packages/web/src/features/player-sync/useAuthStore.ts`:
    - In `flushPendingSync()`: only delete a slot from `pendingSyncQueue` if `pendingSyncQueue.get(slot) === payload` after `postSyncProgress` resolves. Coalesce concurrent `flushPendingSync()` calls by sharing the active in-flight flush promise and running a follow-up pass only if a newer payload was enqueued (`queueVersion` bumped by `syncProgressDebounced`) after the active pass started (preventing duplicate sends even on failure while guaranteeing mid-flight enqueues are flushed).
  - `packages/web/src/features/player-sync/sync-reconcile.ts`:
    - In `gatherLocalData()`: scan `localStorage` keys matching `/^sanakenno_state_(\d+)$/` (deduplicated against `stats.records` slots), skip any slot where `isPuzzleRevealed(slot)` is true when building `puzzle_states` (preserving pre-reveal frozen `stats.records` without exporting post-reveal words), and skip extra `sanakenno_state_*` keys (not in `stats.records`) that have `foundWords.length === 0 && hintsUnlocked.length === 0` (avoiding timer-only ghost states from `useGameTimer`).
    - In `pullAndMergeData()`: preserve `version: 1` when saving merged `PlayerStats` (`{ records: mergedRecords, version: 1 }`).
  - `packages/web/src/features/modals/backfillStats.ts` & `PuzzleWordsModal.tsx`:
    - In `PuzzleWordsModal.tsx`: only write `revealed_<slot> = 'true'` when `show && puzzleNumber !== null && Boolean(data)`.
    - In `backfillNoHintStats`: read each puzzle state once per record via `readSavedPuzzleState`, skip slots where `isPuzzleRevealed(num)` is true, and stop fabricating synthetic `date: today` / `max_score: 100` / `best_rank: 'Onnistuja'` records for omitted `sanakenno_state_*` keys (only backfill `best_no_hint_score`, `long_words_count`, `longest_word` on existing records).
  - Dead hint-deck & screenshot-fixture cleanup:
    - Remove write-only `HINTS_HIDDEN_KEY` / `writeHintsHidden` from `packages/web/src/features/gameplay/useUiStore.ts` (never read since Spec 18).
    - Remove hidden legacy `tier-tab-3` / `tier-tab-4` buttons and dead `matrix_full` / `matrix_totals` / `matrix` checks from `packages/web/src/features/gameplay/HintPanels.tsx`, and remove the dead `'today'` fallback branch in `packages/web/src/features/gameplay/usePuzzleQuery.ts`.
    - Update `scripts/screenshot-targets.ts:105` sample stats fixture from `words_found: i === 0 ? 600 : 0` to `words_found: i === 0 ? 600 : 1` so sample streak screenshots remain 7 days once `computeStreak` requires `words_found > 0`.

## 4. Acceptance Criteria & Verification

*(Keep all test files <= 500 lines: do NOT append new tests to 495-line `modals-theme-rollover.test.tsx`, 481-line `player-sync-store.test.ts`, 451-line `player-sync.test.ts`, or 441-line `gameplay-store.test.ts`; place new tests in the designated files below.)*

### New / Updated Tests (real boundaries, not mock-only)

- [ ] **Shared Domain (`tests/unit/streak.test.ts` & `tests/unit/shared-domain.test.ts`):**
  - `computeStreak` ignores records with `words_found === 0`.
  - `updateStatsRecord` and `mergeStatsRecord` preserve `is_daily: true` for legacy records (`is_daily: undefined`), keep `is_daily: false` when merging an archive record with partial `{ is_daily: undefined, played_at_date: undefined }`, and upgrade `max_score`.
- [ ] **Hint Sync, Gameplay & Sync Queue Integrity (new `tests/unit/hint-sync-integrity.test.ts` & `tests/unit/debounced-sync.test.ts`):**
  - First `unlockHint` on an unassisted puzzle updates `hintsUnlocked` + `scoreBeforeHints`, sets `hintsHidden: false`, queues `syncProgressDebounced`, and triggers immediate `flushPendingSync()`; unlocking with 0 words does not create a local `StatsRecord` yet is included by `gatherLocalData()`.
  - Second distinct `unlockHint` queues `syncProgressDebounced` without immediate `flushPendingSync()`; duplicate, invalid, or `!puzzle` calls are strict no-ops.
  - Queueing a newer payload for the same slot while `flushPendingSync()` is in-flight does not lose the newer payload, and concurrent `Promise.all([flushPendingSync(), flushPendingSync()])` calls coalesce into one request (even on failure).
  - Rapid double `submitWord()` calls and puzzle switch mid-`hashWord` only accept/score once for the matching puzzle (no duplicate effects or cross-puzzle corruption).
  - Midnight rollover drift: when `viewingPuzzleDate === null` and `puzzle.date` is yesterday, both `recordLocalStatsUpdate` and `syncProgressDebounced` stamp `puzzle.date` with `is_daily: false`.
  - `gatherLocalData()` includes 0-word hint-only states, excludes 0-word/0-hint timer-only states, and excludes `revealed_<slot> === 'true'` puzzle states; `pullAndMergeData` preserves `version: 1`.
- [ ] **Revealed Puzzles & Backfill (`tests/unit/Modals.test.tsx` & `tests/unit/hint-sync-integrity.test.ts`):**
  - `PuzzleWordsModal` does not set `revealed_<slot>` when fetching words fails.
  - `backfillNoHintStats` does not fabricate records for revealed or untracked `sanakenno_state_*` entries, and revealed puzzles do not trigger `syncProgressDebounced`, `postWordFind`, `postAchievement`, or `postFailedGuess`.
- [ ] **Server Sync Integration (`tests/integration/player-sync-hardening.test.ts`):**
  - `POST /api/player/sync/progress` with `found_words: []` and `hints_unlocked: ['tier1']` persists `player_puzzle_states` without creating a 0-word `player_stats` row; when a `player_stats` row already exists, `hints_used` is updated.
  - Corrupt JSON in `player_puzzle_states.found_words` / `hints_unlocked` degrades safely to `[]` across `GET /api/player/sync`, `POST /api/player/sync/progress`, and `/auth/transfer/use` without returning 500.
- [ ] **Update Existing Hint Test (`tests/unit/GameplayComponents.test.tsx`):**
  - Replace removed `localStorage.getItem('sanakenno_hints_hidden')` assertions (`L79, L195, L199`) with behavioral collapsed/expanded UI state assertions.

### Visual & Mechanical Gate

- [ ] **Visual Inspection (`pnpm run screenshot`):** Confirm desktop (1280px) & mobile (390px) gameplay/hint deck remain unchanged after removing the hidden legacy tab buttons.
- [ ] **Mechanical Gate:** `pnpm run check:agent` passes 100%
