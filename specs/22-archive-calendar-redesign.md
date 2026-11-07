# Spec 22: Archive Calendar Selector & Day Puzzle Info Panel

Status: shipped
Branch: spec/22-archive-calendar-redesign
Reference (2.0):

- `packages/web/src/features/modals/ArchiveModal.tsx`
- `packages/web/src/features/modals/ArchiveActionSheet.tsx`
- `packages/web/src/features/modals/useArchiveQuery.ts`
- `packages/server/src/features/puzzle/archive.routes.ts`

## 1. Objective

Redesign `ArchiveModal` from a paginated flat list with a stacked popup action sheet into an interactive Monday-first monthly calendar selector with navigation controls and an inline day puzzle info & action panel.

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
  - `isRevealed: boolean` (via `isPuzzleRevealed(entry.puzzle_number)`)

### B. Monthly Calendar Selector & Controls (`packages/web/src/features/modals/ArchiveCalendar.tsx`)

1. **Month Navigation & Quick-Jump Bar:**
   - Displays current viewed month and year in Finnish (e.g., `Marraskuu 2026`) with `Edellinen kuukausi` (`‹`) and `Seuraava kuukausi` (`›`) buttons bounded to months present in the archive.
   - Displays monthly completion counter (e.g., `4 / 7 pelattu`) and a quick `"Tänään"` button when viewing a past month or when a past date is selected.
2. **Monday-First 7-Column Grid (`Ma`–`Su`):**
   - Renders calendar cells for the active month aligned to Monday–Sunday columns.
   - Dates with an `ArchiveEntry` render as interactive buttons (`data-testid="archive-entry-<display_number>"` and `data-testid="archive-day-<date>"`):
     - **Selected state:** Prominent `var(--color-accent)` border/ring and highlighted surface.
     - **Today marker (`is_today`):** Distinct accent indicator dot/underline.
     - **Completion visual encoding:**
       - Unplayed: standard secondary surface (`var(--color-bg-secondary)`).
       - Played (<70%): accent-tinted cell with a bottom progress bar or status dot.
       - Top rank (`Ällistyttävä`, ≥70%): strong accent badge/fill highlight.
       - Revealed (`isRevealed`): subtle eye/revealed marker.
   - Dates without an archive entry (before rotation start or future days in the current month) render as muted, non-interactive cells.

### C. Selected Day Puzzle Info & Action Card (`packages/web/src/features/modals/ArchiveDayPanel.tsx`)

Replaces the separate overlay `ArchiveActionSheet` with an always-visible inline card below the calendar for the currently selected `ArchiveEntry`:
1. **Default Selection & Stepping Controls:**
   - Defaults to the entry matching `currentPuzzleNumber` (or `todayEntry` if null) on modal open, automatically syncing the viewed calendar month.
   - Includes `Edellinen kenno` / `Seuraava kenno` day-stepper buttons to step chronologically through available puzzles without hunting on the grid.
2. **Puzzle Metadata & Letter Preview:**
   - Header: `Kenno #<display_number>` · formatted Finnish date (`formatFinnishDate(entry.date)`), plus `"tänään"` badge (`entry.is_today`) or `"Pelattavana"` badge (`entry.puzzle_number === currentPuzzleNumber`).
   - Letters row: Center letter highlighted in an accent hexagon/pill badge (`var(--color-accent)` / `var(--color-on-accent)`) alongside the 6 outer letters in uppercase mono pills.
3. **Player Progress Summary:**
   - **If played:** Displays achieved rank (`status.rank`), score ratio (`<score> / <max_score> p · <percentage> %`), word count (`<wordsFound> sanaa`), unassisted badge (`"Avuitta"` when `!hintsUsed`), and a compact progress bar.
   - **If unplayed:** Displays `"Ei vielä pelattu"` and `"Maksimipisteet: <max_score> p"`.
   - **If revealed:** Displays `"Vastaukset paljastettu"` notice with `EyeIcon`.
4. **Inline Actions & Reveal Confirmation:**
   - **Primary CTA (`Pelaa` / `Jatka peliä`):** Calls `onSelectPuzzle(entry.puzzle_number, entry.is_today ? null : entry.date)`.
   - **Secondary CTA (`Näytä vastaukset`, past puzzles only):**
     - If already revealed, immediately invokes `onRevealAnswers(entry.puzzle_number, entry.display_number)`.
     - If not yet revealed, swaps the action area inline to the confirmation prompt (`"Paljasta vastaukset?"` + `"Vastauksien paljastamisen jälkeen tästä kennosta ei enää kerry tilastoja."` with `Takaisin` and `Paljasta vastaukset` buttons).

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Unit / Domain (`tests/unit/modals-theme-rollover.test.tsx`):**
  - Verifies `ArchiveModal` renders `display_number` (never raw `slot`), groups dates into the Monday-first calendar grid, and defaults selection to the active puzzle.
  - Verifies clicking a past calendar day updates the inline day info card (letters, center letter, rank, words found, max score) and allows stepping between days/months.
  - Verifies clicking `Pelaa` calls `onSelectPuzzle(slot, date)` for past puzzles and `onSelectPuzzle(slot, null)` for today's puzzle.
  - Verifies clicking `Näytä vastaukset` on an unrevealed past puzzle shows the inline confirmation prompt, and confirming triggers `onRevealAnswers(slot, display_number)`.
- [ ] **Integration & Mechanical Gate:**
  - `pnpm run check:agent` passes 100% (TypeScript, ESLint, Prettier, `tests/architecture.test.ts` <500 lines and no hex colors, Vitest suite, and production build).
- [ ] **Visual Inspection (`pnpm run screenshot` mobile + desktop):**
  - Mobile (`390×844`) and desktop (`1280×800`) screenshots of `ArchiveModal` inspected via `read_file` to verify calendar grid alignment, day cell legibility, and zero vertical overflow or layout clipping.
