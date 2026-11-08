# Spec 23: Modal Container & Structured Header Bar Redesign

Status: shipped
Branch: spec/23-modal-container-and-header-redesign
Reference (2.0):

- `packages/web/src/features/modals/ModalShell.tsx`
- `packages/web/src/features/modals/ArchiveModal.tsx`
- `packages/web/src/features/modals/ArchiveCalendar.tsx`
- `packages/web/src/features/modals/StatsModal.tsx`
- `packages/web/src/features/modals/SettingsModal.tsx`
- `packages/web/src/features/modals/PuzzleWordsModal.tsx`
- `packages/web/src/features/modals/RulesModal.tsx`
- `packages/web/src/features/player-sync/SyncModal.tsx`

## 1. Objective

Redesign `ModalShell` and its consumer modals with a compact, edge-to-edge structured header bar, pinned sub-header support, clean initial dialog focus, and inline header metadata slots so the top of every modal eliminates unanchored empty space and sparse secondary status rows.

## 2. Invariants & Non-Goals

- **Domain Invariants Preserved:** All puzzle numbering (`slot` vs `display_number`), `Europe/Helsinki` midnight countdowns, Kotus lemma links, and archive/stats behaviors remain 100% intact.
- **Zero Hardcoded Hex Colours:** All surfaces, borders, text, and focus rings use `var(--color-*)` CSS custom properties across all 6 palettes and light/dark themes.
- **File Size Ceiling:** Every `.ts` and `.tsx` file remains strictly under 500 lines (`tests/architecture.test.ts`).
- **Accessibility & Focus Trap:** Keyboard `Tab` / `Shift+Tab` trapping, `Escape` dismissal, and opener focus restoration remain intact while avoiding an automatic initial focus ring on the `X` close button when opening a modal.
- **Non-Goal:** No backend/API or database changes.

## 3. Contract & Architecture

### A. Structured `ModalShell` Container (`packages/web/src/features/modals/ModalShell.tsx`)

1. **Flex Column Frame with Pinned Header & Scrollable Body:**
   - Outer dialog box uses `w-full max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[88vh] shadow-xl` with `backgroundColor: 'var(--color-bg-primary)'` and `border: '1px solid var(--color-border)'`.
   - Eliminates ad-hoc per-modal `style={{ maxHeight: '85vh', overflowY: 'hidden' }}` and inconsistent `headerClassName` margin overrides (`mb-1`, `mb-2`, `mb-3`, `mb-4`).
2. **Edge-to-Edge Header Bar (`px-4 py-2.5 border-b`):**
   - Pinned at the top (`shrink-0`) with `backgroundColor: 'var(--color-bg-secondary)'` and `borderColor: 'var(--color-border)'`.
   - Left group: optional `onBack` icon button (`ArrowLeftIcon`) + `<h2 id={titleId} className="text-base font-semibold leading-tight truncate">`.
   - Right group: optional `headerMeta?: ReactNode` slot rendered inline to the left of the close (`X`) button, allowing secondary status indicators or quick-actions to live directly in the header bar instead of occupying a half-empty row below it.
   - Close (`X`) button: styled as a clean, subtle icon button (`h-7 w-7 rounded-lg`, `color: 'var(--color-text-secondary)'`, hover/active surface feedback, and `focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]`).
3. **Initial Focus Behavior (`useDialogFocusTrap`):**
   - On modal open, focuses the dialog container itself (`dialog.focus({ preventScroll: true })`) rather than the first child button so opening a modal via click/tap never draws a loud browser focus box around the `X` button, while `Tab` / `Shift+Tab` immediately cycles through focusable controls inside the dialog.
4. **Optional Pinned Sub-Header & Unified Scrollable Body:**
   - Supports an optional `subHeader?: ReactNode` slot rendered directly below the header bar (`shrink-0`, outside the scroll area).
   - Renders `children` inside a unified scrollable body container (`flex-1 min-h-0 overflow-y-auto px-4 py-3.5`).

### B. Per-Modal Top-Area Consolidation

1. **`SettingsModal` (`packages/web/src/features/modals/SettingsModal.tsx`):**
   - Moves the `Seuraava kenno: 00:00:00` countdown into `ModalShell`'s `headerMeta` slot as a compact inline badge/label in the header bar, removing the sparse right-aligned row from the top of the modal body so `Ulkoasu` begins immediately at the top of the body.
2. **`PuzzleWordsModal` (`packages/web/src/features/modals/PuzzleWordsModal.tsx`):**
   - Moves the `{foundCount}/{sortedWords.length} löydetty` counter into `ModalShell`'s `headerMeta` slot in the header bar, removing the separate top status line so the 3-column word grid starts cleanly at the top of the body.
3. **`ArchiveModal` & `ArchiveCalendar` (`packages/web/src/features/modals/ArchiveModal.tsx`, `ArchiveCalendar.tsx`):**
   - Moves the conditional `"Tänään"` quick-jump pill button into `ArchiveModal`'s `headerMeta` slot in the header bar so the month navigation row (`< Marraskuu 2026 >`) never shifts position.
   - Widens `ArchiveCalendar` from `max-w-[272px]` to full modal body width (`w-full`) with compact day cell heights (`h-9` / `rounded-lg`) so the month navigation bar and 7-column calendar grid align flush with the `ArchiveDayPanel` card below rather than floating in a narrow inset column.
4. **`StatsModal` (`packages/web/src/features/modals/StatsModal.tsx`):**
   - Places the `Yhteenveto | Saavutukset` segmented tab bar in `ModalShell`'s pinned `subHeader` slot (`px-4 pt-2.5 pb-1`) so the tab switcher remains pinned right beneath the `Tilastot` header bar even when scrolling down through `Saavutukset`.
5. **`RulesModal` & `SyncModal` (`packages/web/src/features/modals/RulesModal.tsx`, `packages/web/src/features/player-sync/SyncModal.tsx`):**
   - Removes redundant inner scroll wrappers and top margin offsets (`mt-2`, `headerClassName="mb-4"`), relying on `ModalShell`'s unified body padding and scroll container.

## 4. Acceptance Criteria (Test Catalog)

- [x] **Unit / Component (`tests/unit/modals-theme-rollover.test.tsx`):**
  - Verifies `ModalShell` renders `title`, optional `headerMeta`, optional `subHeader`, `onBack`, and `onClose`, and traps `Tab`/`Escape` keys while focusing the dialog container on initial open without auto-focusing the `X` button.
  - Verifies `SettingsModal` renders `Seuraava kenno:` in the header bar, `PuzzleWordsModal` renders `X/Y löydetty` in the header bar, `ArchiveModal` renders the `Tänään` jump button in the header bar when viewing a past month/date, and `StatsModal` keeps the `Yhteenveto | Saavutukset` tablist pinned in the sub-header.
- [x] **Integration & Mechanical Gate:**
  - `pnpm run check:agent` passes 100% (TypeScript, ESLint, Prettier, `tests/architecture.test.ts`, Vitest unit/integration suite, and production build).
- [x] **Visual Inspection (`pnpm run screenshot` mobile + desktop):**
  - Mobile (`390×844`) and desktop (`1280×800`) screenshots inspected via `read_file` to confirm the structured header bar, clean close button without initial focus ring clutter, flush calendar width in `ArchiveModal`, and pinned tab bar in `StatsModal`.
