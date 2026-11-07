# Spec 22: Archive Calendar Selector & Day Puzzle Info Panel

Status: shipped
Branch: spec/22-archive-calendar-redesign
Reference (2.0):

- `packages/web/src/features/modals/ArchiveModal.tsx`
- `packages/web/src/features/modals/PuzzleWordsModal.tsx`
- `packages/web/src/features/modals/useArchiveQuery.ts`
- `packages/server/src/features/puzzle/archive.routes.ts`

## 1. Objective

Redesign `ArchiveModal` from a paginated flat list with a stacked popup action sheet into a compact, zero-dead-space Monday-first monthly calendar selector with an inline day puzzle info & action panel and direct back-to-calendar navigation from a revealed day's word list.

## 2. Invariants & Non-Goals

- **`slot` vs `display_number` Separation:** `ArchiveModal` and its child components must always display `display_number` (`Kenno #<display_number>`) in the UI while using permanent `puzzle_number` (`slot`) for storage keys (`puzzleStateKey(slot)`, `revealedKey(slot)`) and API calls.
- **Timezone & Today Boundary:** Calendar dates, month grouping, and `"tänään"` markers strictly use the `YYYY-MM-DD` `Europe/Helsinki` date strings returned by `GET /api/archive?all=true`. Future dates and dates without an archive puzzle are disabled.
- **Zero Hardcoded Hex Colours & Zero External UI Dependencies:** All styling uses `var(--color-*)` CSS custom properties across all 6 palettes and light/dark themes. Use a purpose-built, zero-dependency calendar grid rather than an external date-picker library so custom per-day game status indicators, bundle size, and theme tokens remain 100% native.
- **Answer Reveal Protection:** Today's active puzzle (`is_today: true`) never exposes `"Näytä vastaukset"`. Past puzzles require explicit confirmation before revealing answers for the first time, setting `revealed_<slot> = 'true'` in `localStorage`.
- **File Size Ceiling:** Every `.ts` and `.tsx` file must stay strictly under 500 lines (`tests/architecture.test.ts`).
- **Non-Goal:** Server-side `GET /api/archive` schema and SQLite tables remain unchanged; all required metadata (`date`, `puzzle_number`, `display_number`, `letters`, `center`, `is_today`, `max_score`) is already served in a single batch query.

## 3. Contract & Architecture

### A. Play Status Resolution (`packages/web/src/features/modals/archiveStatus.ts`)

Extract a pure helper module that resolves a player's status for any `ArchiveEntry`:
- Reads per-puzzle local state from `puzzleStateKey(entry.puzzle_number)` and falls back to `STATS_STORAGE_KEY` (`PlayerStats.records`) when a puzzle was synced via summary stats.
- Returns structured `ArchivePlayStatus`:
  - `played: boolean`
  - `rank: string | null` (via `rankForScore(score, entry.max_score)`)
  - `score: number`
  - `maxScore: number`
  - `percentage: number` (`0`–`100`)
  - `wordsFound: number`
  - `hintsUsed: boolean`
  - `isTopRank: boolean` (`percentage >= 70`, i.e., `"Ällistyttävä"`)
  - `isFullBoard: boolean` (`maxScore > 0 && score >= maxScore`, i.e., `"Täysi kenno"`)
  - `isRevealed: boolean` (via `isPuzzleRevealed(entry.puzzle_number)`)

### B. Monthly Calendar Selector & Controls (`packages/web/src/features/modals/ArchiveCalendar.tsx`)

1. **Month Navigation & Quick-Jump Bar:**
   - Displays current viewed month and year in Finnish (e.g., `Marraskuu 2026`) with `Edellinen kuukausi` (`‹`) and `Seuraava kuukausi` (`›`) buttons bounded to months present in the archive.
   - Displays a clickable `"Tänään"` pill button when viewing a past month or when a past date is selected.
2. **Monday-First 7-Column Fixed 6-Week Square Grid (`Ma`–`Su`):**
   - Renders all days (`1..daysInMonth`) of the viewed month in a compact Monday-first 7-column grid (`max-w-[272px] mx-auto`) with square day cells (`aspect-square`), padded with leading and trailing empty cells to always reserve a fixed 6-week (`42`-cell) height so switching between 4-, 5-, and 6-week months never shifts the modal height or controls.
   - `ArchiveModal` sizes dynamically to its content (`max-h-[90vh]`) rather than forcing a fixed `85vh` height, eliminating bottom modal whitespace.
   - Dates with an `ArchiveEntry` render as square interactive buttons (`data-testid="archive-entry-<display_number>"` and `data-date="<YYYY-MM-DD>"`) displaying the day number and a bottom progress dot:
     - **Selected state:** Prominent `var(--color-accent)` inset border and accent-tinted surface.
     - **Today marker (`is_today`):** Bold `var(--color-accent)` day number and subtle accent border.
     - **Completion visual encoding (bottom dot under the day number):**
       - Unplayed (`!status.played`): no dot.
       - Started (`status.played && !status.isFullBoard`): muted dot (`var(--color-text-tertiary)`).
       - Finished (`status.isFullBoard`, `"Täysi kenno"`): accent dot (`var(--color-accent)`).
   - Non-puzzle / future dates in the month render as muted `aspect-square` cells so the full month layout stays intact.

### C. Selected Day Puzzle Info & Action Card (`packages/web/src/features/modals/ArchiveDayPanel.tsx`)

Replaces the separate overlay `ArchiveActionSheet` with an always-visible slim inline card below the calendar for the currently selected `ArchiveEntry`:
1. **Default Selection & Stepping Controls:**
   - Defaults to the entry matching `currentPuzzleNumber` (or `todayEntry` if null) on fresh modal open, and preserves the selected date when returning from the revealed word list.
   - Includes `Edellinen kenno` / `Seuraava kenno` day-stepper buttons in the card header to step chronologically through available puzzles.
2. **Puzzle Metadata, Status & Separate 7-Letter Tiles:**
   - Header left: formatted Finnish date (`formatFinnishDate(entry.date)`), `"tänään"` badge (`entry.is_today`), and `Kenno #<display_number>`.
   - Header right: achieved rank (`status.rank`) and word count (`<wordsFound> sanaa`) when played, `"Ei pelattu"` when unplayed, plus `EyeIcon` when `status.isRevealed`.
   - Letters row: 7 separate letter tiles (`w-7 h-7 rounded-lg`) with the center letter first in an accent tile (`var(--color-accent)` / `var(--color-on-accent)`) followed by the 6 outer letters in bordered tiles.
4. **Inline Actions, Pop-up Reveal Confirmation & Back-to-Calendar Word List Navigation:**
   - **Primary CTA (`Pelaa` / `Jatka peliä`):** Calls `onSelectPuzzle(entry.puzzle_number, entry.is_today ? null : entry.date)`.
   - **Secondary CTA (`Näytä vastaukset`, past puzzles only):**
     - If already revealed, immediately invokes `onRevealAnswers(entry.puzzle_number, entry.display_number)`.
     - If not yet revealed, displays a pop-up selection dialog (`role="alertdialog"`) over the modal with the confirmation prompt (`"Vastauksien paljastamisen jälkeen tästä kennosta ei enää kerry tilastoja."` with `Takaisin` and `Paljasta vastaukset` buttons), keeping the underlying modal size completely static.
   - **Back to Calendar from Revealed Word List (`PuzzleWordsModal.tsx` & `GameplayView.tsx`):**
     - `PuzzleWordsModal` accepts an optional `onBack?: () => void` callback and renders a `"Takaisin arkistoon"` (`← Arkisto`) button in the modal header alongside the close (`×`) button.
     - Clicking `"Takaisin arkistoon"` (or pressing `Escape`) closes the word list and returns directly to `ArchiveModal` on the same selected date; clicking `×` (`Sulje`) dismisses the modal completely.

## 4. Acceptance Criteria (Test Catalog)

- [x] **Unit / Domain (`tests/unit/modals-theme-rollover.test.tsx`):**
  - Verifies `ArchiveModal` renders `display_number` (never raw `slot`), groups dates into the Monday-first calendar grid, and defaults selection to the active puzzle.
  - Verifies clicking a past calendar day updates the inline day info card (letters, center letter, rank, words found, max score) and allows stepping between days/months.
  - Verifies clicking `Pelaa` calls `onSelectPuzzle(slot, date)` for past puzzles and `onSelectPuzzle(slot, null)` for today's puzzle.
  - Verifies clicking `Näytä vastaukset` on an unrevealed past puzzle shows the inline confirmation prompt, and confirming triggers `onRevealAnswers(slot, display_number)`.
- [x] **Integration & Mechanical Gate:**
  - `pnpm run check:agent` passes 100% (TypeScript, ESLint, Prettier, `tests/architecture.test.ts` <500 lines and no hex colors, Vitest suite, and production build).
- [x] **Visual Inspection (`pnpm run screenshot` mobile + desktop):**
  - Mobile (`390×844`) and desktop (`1280×800`) screenshots of `ArchiveModal` inspected via `read_file` to verify calendar grid alignment, day cell legibility, and zero vertical overflow or layout clipping.
