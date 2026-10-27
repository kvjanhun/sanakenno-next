# Spec 04: Player Modals, Themes & Midnight Rollover

Status: approved
Branch: spec/04-modals-themes-and-rollover
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/packages/web/src/components/ArchiveModal.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/PuzzleWordsModal.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/StatsModal.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/RulesModal.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/SettingsModal.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/store/usePaletteStore.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/store/useThemePreferenceStore.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/hooks/useMidnightRollover.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/styles/index.css`

## 1. Objective

Port the player modals (`ArchiveModal`, `PuzzleWordsModal`, `StatsModal`, `RulesModal`, `SettingsModal`), the complete CSS custom-property palette/theme system, and the `Europe/Helsinki` midnight rollover hook.

## 2. Invariants & Non-Goals

- **1:1 Theme & Storage Parity:** Preserve all theme IDs (`DEFAULT_THEME_ID`, `THEME_IDS`), `data-palette` / `data-theme` DOM attributes, and `localStorage` keys for palette and dark/light/system preference.
- **Archive & Answer Reveal Rules:** `ArchiveModal` displays `display_number` (never raw `slot` when they differ) and completion status from `localStorage`. Revealing answers in `PuzzleWordsModal` sets `revealed_<slot> = 'true'` and blocks today's active puzzle.
- **Non-Goal:** Authenticated player sync inside `SettingsModal` / `SyncModal` is wired in Spec 05.

## 3. Contract & Architecture

- **`@sanakenno/web/src/styles/tokens.css` & `features/theme/`:**
  - Port full light/dark CSS token definitions across all palettes, `usePaletteStore`, `useThemePreferenceStore`, `ThemeSelector`, and `ThemeToggle`.
- **`@sanakenno/web/src/features/modals/`:**
  - `ArchiveModal.tsx` + `useArchiveQuery.ts` (TanStack Query over `apiClient.api.archive.$get({ query: { all: 'true' } })`).
  - `PuzzleWordsModal.tsx` + `usePuzzleWordsQuery.ts` (TanStack Query over `apiClient.api.puzzle[':number'].words.$get`).
  - `StatsModal.tsx` (lifetime stats, streak, rank distribution, no-hint stats, clipboard share via `buildShareText`).
  - `RulesModal.tsx` and `SettingsModal.tsx`.
- **`@sanakenno/web/src/features/gameplay/useMidnightRollover.ts`:**
  - Detects `Europe/Helsinki` date change on visibility/interval and refreshes the active daily puzzle.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit tests verify `useMidnightRollover` across `Europe/Helsinki` midnight boundaries and theme/palette DOM attribute updates (`data-palette`, `data-theme`).
- [ ] Component/Integration tests verify `ArchiveModal` past-puzzle selection, `PuzzleWordsModal` setting `revealed_<slot> = 'true'`, and `StatsModal` rendering computed streaks and rank distribution.
- [ ] Playwright E2E test verifies switching themes/palettes, opening `RulesModal` and `StatsModal`, and loading a past puzzle from `ArchiveModal`.
