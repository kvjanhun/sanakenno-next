# Spec 18: Per-Puzzle Hints Collapsed / Expanded Default State

Status: shipped
Branch: spec/18-per-puzzle-hints-collapsed-state
Reference (1.0): `packages/web/src/features/gameplay/useUiStore.ts`, `packages/web/src/features/gameplay/useGameStore.ts`, `packages/web/src/features/gameplay/HintPanels.tsx`

## 1. Objective

Ensure hints accordion default state is evaluated per-puzzle rather than leaking a global open state across days and archive puzzles. Puzzles with no hints unlocked start collapsed (hints hidden), while puzzles with hints unlocked default to expanded.

## 2. Invariants & Non-Goals

- **Invariants:**
  - Fresh / unplayed / unassisted puzzles (zero hints unlocked) always start with the hints accordion collapsed (`hintsHidden = true`).
  - When switching between puzzles (e.g. today's puzzle to an archive puzzle, or midnight rollover), if the target puzzle has no unlocked hints, hints must start collapsed even if the player had hints expanded in the previous puzzle.
  - If a target puzzle has unlocked hints (`hintsUnlocked.size > 0`), hints expanded (`hintsHidden = false`) is the default upon loading.
  - Active manual toggling (`Näytä avut` / `Piilota avut`) remains functional during gameplay in any puzzle.
  - Fixed-height hint deck (172px) guarantees zero vertical layout shift whether collapsed or expanded.
  - Monolith ceiling: every file remains strictly <500 lines.
- **Non-Goals:**
  - No changes to hint unlocks, scoring, or `@sanakenno/shared` domain logic.
  - No backend database schema changes or new RPC routes.

## 3. Contract & Architecture

- **Frontend Slice (`@sanakenno/web`):**
  - `useUiStore.ts`:
    - Default initial state for `hintsHidden` is `true`.
    - `resetUi()` resets `hintsHidden: true`.
    - `setHintsHidden(hidden)` updates store state and synchronizes `HINTS_HIDDEN_KEY` for backward compatibility with component tests.
  - `useGameStore.ts`:
    - In `loadPuzzle(data)`: reset `useUiStore.getState().setHintsHidden(true)` upfront while new puzzle is initialized.
    - In `loadState()`: inspect persisted state for the target puzzle. If `filterVisibleHintIds(saved.hintsUnlocked ?? []).length > 0`, set `useUiStore.getState().setHintsHidden(false)`. If no hints unlocked (or no saved state), ensure `useUiStore.getState().setHintsHidden(true)`.
    - In `unlockHint(id)`: ensure `useUiStore.getState().setHintsHidden(false)`.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit / State (`tests/unit/gameplay-store.test.ts`):
  - Starting or loading a puzzle without hints sets `hintsHidden` to `true`.
  - Expanding hints on puzzle A (`setHintsHidden(false)`) and then loading an unplayed/unassisted puzzle B resets `hintsHidden` to `true`.
  - Loading a puzzle with saved unlocked hints sets `hintsHidden` to `false`.
  - Loading an unplayed puzzle after a played puzzle with unlocked hints resets `hintsHidden` to `true`.
- [ ] Conventional UI (`tests/unit/GameplayComponents.test.tsx`):
  - Collapsed toolbar displays counter and `Näytä avut` button.
  - Clicking `Näytä avut` expands the hint deck and clicking `Piilota avut` collapses it.
- [ ] Mechanical Gate: `pnpm check:agent` passes 100%.
