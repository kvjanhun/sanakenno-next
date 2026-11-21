# Spec 40: Web UI Modernization (`lucide-react`, Native `<dialog>`/`<details>`, Theme/PWA & Admin React Query)

Status: shipped
Branch: spec/40-web-native-ui-icons-and-theme-fixes

## 1. Objective

Replace hand-copied library code and custom UI plumbing in `@sanakenno/web` with lean libraries and native browser APIs (`lucide-react`, native `<dialog>` & `<details>`, and already-installed `@tanstack/react-query` for admin views), while fixing real UI/accessibility/state bugs (broken `CombinationsBrowser` pagination, `PuzzleEditor` races/delete-target/force-save, `ModalShell` focus stealing & Escape double-close, live OS theme reactivity, Tailwind `dark:` variant mismatch, keyboard lock behind `SyncModal`, and PWA reload guard).

## 2. Invariants & Non-Goals

- **Visual & Brand Parity:** Gameplay, modals, themes, and admin panels must keep Sanakenno's visual design, CSS custom properties (`var(--color-*)`), 440px gameplay ceiling, 16px mobile modal gutters, and Finnish UI strings intact. Custom brand/domain glyphs (`PairsIcon`, `HexagonMedallion`, and `CircleStarIcon` if not matched identically in `lucide-react`) remain custom.
- **License & Architecture Compliance:** Adding `lucide-react` (ISC License) requires attributing Lucide in `OPEN_SOURCE_LICENSES.md` (including the ISC License text in Section 4) and `packages/web/src/features/modals/licenses.ts`, and updating `tests/architecture.test.ts` (replacing the retired `not.toMatch(/\bLucide\b/i)` check with a positive attribution check). Every file stays <= 500 lines and uses zero hardcoded hex colors in `.tsx`.
- **Zero New Dependencies Beyond `lucide-react`:** `@tanstack/react-query` is already installed in `@sanakenno/web`; modals and disclosures use native HTML `<dialog>` and `<details>/<summary>` with zero third-party UI libraries.
- **Non-Goals:** No backend API or DB schema changes (admin backend fixes and migration unification live in Spec 41). Do not add a routing library (`App.tsx` stays 2-route hash check) or date/calendar library (`ArchiveCalendar.tsx` stays custom). Keep `adminGetSlots` non-OK fallback intact.

## 3. Contract & Architecture

- **Icons (`lucide-react` Consolidation):**
  - Add `lucide-react` to `packages/web/package.json` `dependencies`.
  - Replace the hand-copied Lucide SVG path components across `packages/web/src/features/gameplay/icons.tsx` (416 LOC), `packages/web/src/features/modals/achievementIcons.tsx` (181 LOC), and inline admin SVGs (`AdminWordListPanel.tsx`, `WordList.tsx`) with tree-shaken imports from `lucide-react`, preserving each exported wrapper's exact default `size`, `strokeWidth`, and inline spacing (`BulbIcon`, `SummaryIcon`, `DistributionIcon`). Keep `PairsIcon`, `HexagonMedallion`, and (if no exact 1:1 glyph exists) `CircleStarIcon` custom; remove duplicated `SvgIcon`/`SparklesIcon` and any unused icon wrappers (such as unused `UserIcon` if unreferenced).
  - Attribute **Lucide (`lucide-react`, ISC License)** in `OPEN_SOURCE_LICENSES.md` (add ISC License text block to Section 4) and `packages/web/src/features/modals/licenses.ts`, and update `tests/architecture.test.ts`.
- **Native `<dialog>` Modals & Disclosures:**
  - `packages/web/src/features/modals/ModalShell.tsx`:
    - Migrate `ModalShell` from a `<div>` + custom `useDialogFocusTrap` to a native `<dialog>` element opened with `if (!dialog.open) dialog.showModal()` (StrictMode-safe).
    - Because Tailwind CSS v4 Preflight resets `* { margin: 0; padding: 0; }`, explicitly style `<dialog>` with `m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[88vh] shadow-xl outline-none backdrop:bg-black/60` (preserving the 16px mobile gutter on 390px viewports and centered alignment).
    - Handle `cancel` (Escape) via `e.preventDefault(); onEscapeRef.current?.() ?? onCloseRef.current()` and backdrop clicks only when both `pointerdown` and `click` target the `<dialog>` element itself (so drag-selecting text out onto the backdrop never closes the modal).
    - Store `onClose`/`onEscape` in refs so callback identity changes never re-run the open/focus effect; place initial focus on the `<dialog>` container (`tabIndex={-1}`).
  - `packages/web/src/features/modals/ArchiveModal.tsx`:
    - Convert the nested `confirmEntry` overlay to a native `<dialog role="alertdialog">` (`showModal()`) with `m-auto w-[calc(100%-2rem)] max-w-xs ... backdrop:bg-black/50`, so it renders cleanly in the top-layer above the archive `<dialog>` with native focus trapping and Escape handling.
  - `packages/web/src/features/gameplay/GameplayView.tsx`:
    - Add `!showAuth && celebration === null` to `useKeyboard`'s `enabled` flag.
    - Stop `useKeyboard`'s `onEscape` handler from closing modals already managed by `ModalShell` (`showArchive`, `showStats`, `showRules`, `showSettings`, `showAuth`, `revealPuzzle`)—leave `useKeyboard` `onEscape` strictly for non-modal overlays (`showRanks`), preventing Escape inside a nested `<dialog>` (like `ArchiveModal`'s reveal confirmation) from bubbling to `window` and closing the parent modal too.
  - `scripts/screenshot-targets.ts`:
    - Update `openDialogScript` (`L127`) from `document.querySelector('[role="dialog"]')` to `document.querySelector('dialog[open], [role="dialog"]')` so automated screenshots detect native `<dialog>` modals.
  - `packages/web/src/features/modals/PrivacySection.tsx` & `SettingsModal.tsx`:
    - Convert `PrivacySection`'s expandable block to native `<details>`/`<summary>`.
    - Keep `SettingsModal`'s inline footer `Lisenssit` trigger as a `<button aria-expanded={licensesOpen} aria-controls="settings-licenses-panel">` (so the `erez.ac · GitHub · Lisenssit` flex row and full-width license list below it keep exact visual parity).
    - Wrap palette and theme-preference `role="radio"` controls in `SettingsModal.tsx` in proper `role="radiogroup"` containers; remove the unused `isLinked` prop from `SettingsModalProps` and its callers (`GameplayView.tsx`, `tests/unit/modals-theme-rollover.test.tsx`).
  - `tests/setup.ts`:
    - Polyfill `HTMLDialogElement.prototype.showModal` and `close` for `jsdom` (toggling the `open` attribute and dispatching `close`, plus honoring `cancel` on Escape in dialog tests).
- **Theme Reactivity, Tailwind `dark:`, Archive & PWA Fixes:**
  - `packages/web/src/styles/tokens.css`: Add Tailwind v4 multi-rule `@custom-variant dark` block so `dark:` utilities (including `SettingsModal` sync status colors) match both explicit `[data-theme='dark']` and OS `@media (prefers-color-scheme: dark)` when `:root:not([data-theme='light'])`:
    ```css
    @custom-variant dark {
      &:where([data-theme='dark'], [data-theme='dark'] *) {
        @slot;
      }
      @media (prefers-color-scheme: dark) {
        &:where(:root:not([data-theme='light']), :root:not([data-theme='light']) *) {
          @slot;
        }
      }
    }
    ```
  - `packages/web/src/features/theme/useThemePreferenceStore.ts`, `usePaletteStore.ts`, `ThemeToggle.tsx`, `ThemeSelector.tsx`, `SettingsModal.tsx`, `GameplayView.tsx`:
    - Add a reactive `resolvedScheme: 'light' | 'dark'` state field to `useThemePreferenceStore` updated via a `window.matchMedia('(prefers-color-scheme: dark)')` `change` listener, and subscribe to it in `GameplayView.tsx` (`Honeycomb`), `ThemeToggle.tsx`, `ThemeSelector.tsx`, and `SettingsModal.tsx` so OS scheme changes update live in `system` mode.
    - Write only canonical keys (`THEME_ID_STORAGE_KEY = 'sanakenno_theme_id'` and `THEME_PREFERENCE_STORAGE_KEY = 'sanakenno_theme_preference'`) while preserving read-fallback for legacy `sanakenno_palette` / `sanakenno_theme` keys; reuse `AUTH_TOKEN_STORAGE_KEY` from `@sanakenno/shared` and a single exported `PREFERENCES_UPDATED_AT_KEY`; deduplicate the 6-swatch palette grid logic between `ThemeSelector` and `SettingsModal`.
  - `packages/web/src/features/modals/ArchiveCalendar.tsx`, `archiveStatus.ts`, `RulesModal.tsx`, `AchievementsList.tsx`:
    - Replace invalid `role="grid"` (missing `row`/`gridcell`) on `ArchiveCalendar` with a clean labeled container (`role="group"` + `aria-label="Arkiston kalenteripäivät"`) so assistive tech never encounters malformed grid markup.
    - Read `sanakenno_player_stats` once per calendar render via `useMemo` instead of parsing `localStorage` up to 31 times inside the day loop; prune unused fields (`score`, `maxScore`, `percentage`, `hintsUsed`, `isTopRank`) from `ArchivePlayStatus`.
    - Remove typo class `m-b-10` in `RulesModal.tsx:16` (or replace with `mb-2.5` if spacing intended); replace hardcoded `completedCount === 6` with `completedCount === achievements.length` in `AchievementsList.tsx:74`.
  - `packages/web/src/pwa.config.ts`:
    - Store a timestamp (not `'1'`) in `CHUNK_RELOAD_SESSION_KEY` and allow a reload only if no reload occurred within the last 15 seconds (handles multiple deploys in one tab session without risking an infinite loop on permanently broken lazy chunks). If `sessionStorage` throws, skip reloading rather than looping infinitely.
  - `packages/web/src/App.tsx` & `packages/web/src/features/admin/AdminLayout.tsx`:
    - Remove the outer `<main>` wrapper in `App.tsx:35` (keep the single `<main>` inside `AdminLayout.tsx`) and remove the discarded `usePaletteStore((s) => s.themeId)` call in `AdminLayout.tsx:31`.
- **Admin Views on `@tanstack/react-query` & Client Cleanup:**
  - Migrate manual `useState`+`useEffect` fetches in `packages/web/src/features/admin/` (`CombinationsBrowser`, `PuzzleEditor`, `Schedule`, `BlockedWords`, `SuggestionPanel`, `SuggestionRejections`, `Stats`, `WordData`, `WordFinds`) to `useQuery` / `useMutation` + `queryClient.invalidateQueries`. Extract `PuzzleEditor` query/mutation hooks into `usePuzzleEditorQueries.ts` so `PuzzleEditor.tsx` (currently 489 lines) stays well below the 500-line ceiling.
  - Fix concrete admin UI bugs during migration:
    - `CombinationsBrowser.tsx`: pagination advances cleanly without resetting to page 1.
    - `PuzzleEditor.tsx` & `PuzzleSlotControls.tsx`: eliminate async races on rapid Prev/Next/center clicks; accept an explicit `slot: number` in `handleDelete(slot)` so top-bar "Poista kierrosta" deletes `currentSlot` and `ManualPuzzleForm`'s "Poista peli" deletes `newSlot`; track `currentForceRequired` separately from `formForceRequired` and render a force-override CTA for current-slot saves when `requires_force` is returned; stop `handleCenterSelect`/`handleRestore` from overwriting `ManualPuzzleForm` inputs.
    - `WordFinds.tsx`: invalidate/refresh the word-finds query after blocking a word, and fetch `adminGetSlots(csrfToken)` via `useQuery` to clamp/disable "Seuraava peli" at `total_puzzles`.
    - `WordList.tsx`: sort words in Finnish alphabetical order (`compareFinnishAlphabetically`) and replace custom `isPangramWord` with shared `isPangram` from `@sanakenno/shared` (after normalizing comma-separated `letters` into a 7-char set).
  - `packages/web/src/api/client.ts` & `admin-client.ts`: Extract shared `readErrorMessage`, remove dead `adminChangeCenter`, remove redundant `init: { credentials: 'same-origin' }`, and throw on non-OK HTTP responses in `adminGetBlocked`, `adminGetSchedule`, and `adminGetSuggestionRejections` instead of swallowing errors into `[]`.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Modals & Native `<dialog>` (`tests/unit/Modals.test.tsx` — do NOT append to 495-line `modals-theme-rollover.test.tsx`):**
  - Opening/closing `ModalShell` via `showModal()`/`close()`, `cancel` (Escape), and backdrop click; text-selection drag starting inside the modal and ending on backdrop does not close it.
  - Re-rendering a modal with a new `onClose`/`onEscape` reference does not steal focus; opening `ArchiveModal`'s reveal confirmation `<dialog>` keeps focus in the confirm dialog and Escape closes only the confirm dialog (not the underlying `ArchiveModal`).
  - `PrivacySection` `<details>` toggles natively; `SettingsModal` `Lisenssit` button toggles `aria-expanded` and renders Lucide attribution.
- [x] **Theme, Keyboard & PWA (`tests/unit/Modals.test.tsx`, `tests/unit/gameplay-flow.test.tsx`, `tests/unit/pwa-config.test.ts`):**
  - Dispatching a `change` event on mocked `matchMedia('(prefers-color-scheme: dark)')` while `preference === 'system'` updates `resolvedScheme` reactively.
  - Update `tests/unit/modals-theme-rollover.test.tsx` existing assertions for canonical-key writes (`L135-143`), updated calendar container role (`L279-280`), and removed `isLinked` prop (`L194, L215`).
  - Typing letters while `SyncModal` (`showAuth: true`) or `Celebration` is open does not mutate `currentWord`.
  - `installChunkLoadErrorHandler` allows a second reload after the 15s cooldown window, suppresses immediate repeat reloads within the window, and does not reload when `sessionStorage` throws (updating `tests/unit/pwa-config.test.ts:119` from `'1'` to a numeric timestamp).
- [x] **Admin React Query & Bug Regressions (`tests/unit/admin-components.test.tsx`, `tests/unit/admin-puzzle-editor.test.tsx`, `tests/unit/api-clients.test.ts`):**
  - Wrap rendered admin components in a `QueryClientProvider` (`retry: false`) test helper in both admin test files.
  - `CombinationsBrowser` clicking "Seuraava" stays on page 2 (does not bounce back to page 1).
  - `PuzzleEditor` top-bar delete targets `currentSlot` even when `newSlot` is populated, while `ManualPuzzleForm` delete targets `newSlot`; `requires_force` on current-slot save allows confirming force-save.
  - `WordFinds` invalidates/refreshes after blocking and disables "Seuraava peli" at the last puzzle; `adminGetBlocked`/`adminGetSchedule`/`adminGetSuggestionRejections` reject on HTTP error instead of returning `[]`; update `tests/unit/api-clients.test.ts:135` for removed redundant `credentials: 'same-origin'`.

### Visual & Mechanical Gate

- [x] **Visual Inspection (`pnpm run screenshot all`):** Inspect desktop (1280px) & mobile (390px) screenshots across gameplay, settings (light & dark), sync, archive, stats, and rules modals to verify `lucide-react` icon rendering, native `<dialog>` centering + 16px mobile gutters + `::backdrop`, `<details>` disclosure, and dark-mode contrast.
- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%
