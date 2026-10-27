# Spec 03: Core Gameplay UI & Hybrid State Slice

Status: approved
Branch: spec/03-core-gameplay-ui-and-state
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/packages/web/src/store/useGameStore.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/Honeycomb/`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/WordInput.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/RankProgress.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/FoundWords.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/HintPanels.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/GameControls.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/MessageBar.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/Celebration.tsx`

## 1. Objective

Port the core Finnish word-puzzle gameplay UI and decompose 1.0's 726-line `useGameStore.ts` into the agreed hybrid architecture: TanStack Query for puzzle fetching, a focused `useGameStore` (<350 lines) for synchronous gameplay and 1:1 `localStorage` persistence, and `useUiStore` for ephemeral UI/toast/modal state.

## 2. Invariants & Non-Goals

- **100% `localStorage` Key & Format Parity:** Preserve `sanakenno_state_<slot>`, `sanakenno_stats`, and `revealed_<slot>` with identical JSON schemas so existing players lose zero progress on cutover.
- **Frozen Stats on Revealed Puzzles:** If `revealed_<slot> === 'true'`, finding words must never mutate `sanakenno_stats`.
- **No Direct `fetch()` & <500 Lines Per File:** All API calls go through `src/api/client.ts`; all styling uses CSS custom property tokens (`var(--color-*)`).
- **Non-Goal:** Archive/Stats/Rules/Settings modals and cross-device player sync are deferred to Specs 04 and 05.

## 3. Contract & Architecture

- **`@sanakenno/web/src/features/gameplay/`:**
  - `usePuzzleQuery.ts`: TanStack Query hook wrapping `apiClient.api.puzzle.$get` (supports today and archive `?date=`).
  - `useGameStore.ts` (<350 lines): Synchronous word building (`addLetter`, `deleteLetter`, `shuffleLetters`, `submitWord` using Web Crypto SHA-256 against `word_hashes`), hint unlocking (`scoreBeforeHints` capture), timer state (`startedAt`, `totalPausedMs`), and `localStorage` read/write helpers.
  - `useUiStore.ts`: Toast messages (`message`, `secondaryMessage`), `celebration` (`allistyttava` | `nohint-allistyttava` | `taysikenno`), `wordShake`, `pressedHexIndex`, and modal open/close booleans.
  - Components: `Honeycomb`, `WordInput`, `RankProgress`, `FoundWords` (with Kotus dictionary links), `HintPanels`, `GameControls`, `MessageBar`, `Celebration`, and hooks `useKeyboard` + `useGameTimer`.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit/Integration tests in `tests/unit/gameplay-store.test.ts` verify word validation via SHA-256 hashes, pangram bonus scoring, `scoreBeforeHints` capture on first hint unlock, `localStorage` persistence under `sanakenno_state_<slot>`, and stats freeze when `revealed_<slot>` is set.
- [ ] Component tests (`*.test.tsx`) verify `Honeycomb` letter interaction, `RankProgress` threshold display, and `HintPanels` progressive unlock.
- [ ] Playwright E2E test in `tests/e2e/gameplay.spec.ts` loads the daily puzzle, types and submits a valid Finnish word, verifies score/rank updates, and confirms state survives a page reload.
