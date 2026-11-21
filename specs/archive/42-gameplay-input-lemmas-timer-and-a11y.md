# Spec 42: Gameplay Input, Canonical Lemmas, Active Timer & Honeycomb A11y

Status: shipped
Branch: spec/42-gameplay-input-lemmas-timer-and-a11y

## 1. Objective

Resolve five verified gameplay, input, display, timer, and accessibility bugs in `@sanakenno/web`: render canonical hyphenated Kotus lemmas in `FoundWords` and `StatsModal`, dynamically scale `WordInput` font size for long Finnish words, accept `å` and guard `ConnectBanner` + focused interactive elements in `useKeyboard`, make `Honeycomb` cells keyboard- and screen-reader-accessible, and measure active play `elapsed_ms` accurately across closed tabs and synced devices.

## 2. Invariants & Non-Goals

### Invariants

- **Fixed Board Geometry:** `WordInput` stays strictly `38px` tall (`minHeight: '38px'`, `height: '38px'`) across all word lengths so typing long words never shifts `Honeycomb` or `MessageBar` vertically.
- **Canonical Lemma Display vs. Normalized Storage:** `FoundWords` and `StatsModal` (`Pisin sana`) continue storing, deduplicating, and matching `lastResubmittedWord` by normalized hyphen-free keys, while displaying `getCanonicalLemma(word)` to match `PuzzleWordsModal` and Kotus links.
- **Non-Underline Minimal Aesthetic:** `FoundWords` keeps its existing word order, bold pangram styling, and `text-decoration: none` with zero added link badges or icons.
- **Keyboard Focus Safety:** Activating a focused hex cell or button with `Enter`/`Space` must not trigger `useKeyboard`'s global board submit or shuffle listeners.
- **Zero Schema Migration:** Active elapsed time flows through existing `started_at` and `total_paused_ms` sync fields plus optional local `lastActiveAt` tracking in `localStorage`.

### Non-Goals

- Adding `FoundWords` link icons/badges or `StatsModal` extra summary metrics/card splits.
- Re-implementing `puzzles.max_score` invalidation on word block/unblock (already shipped in Spec 41).
- Changing `elapsed_ms` UI presentation in `StatsModal`.

## 3. Contract & Architecture

### A. Canonical Hyphenated Lemmas (`FoundWords.tsx`, `StatsModal.tsx`)

- In `packages/web/src/features/gameplay/FoundWords.tsx`, import `getCanonicalLemma` from `@sanakenno/shared` and render `{getCanonicalLemma(word)}` (and use it in `title` and `aria-label`) inside both expanded columns and collapsed pills while keeping normalized `word` as React `key` and `lastResubmittedWord` comparison target.
- In `packages/web/src/features/modals/StatsModal.tsx`, render `lifetime.longestWord ? getCanonicalLemma(lifetime.longestWord) : '—'` for `Pisin sana`.

### B. Long-Word Scaling, `å` Support & Keyboard Guards (`WordInput.tsx`, `GameplayView.tsx`, `useKeyboard.ts`)

- In `packages/web/src/features/gameplay/WordInput.tsx`, compute a stepped font size based on `currentWord.length` inside the fixed `38px`-tall centered flex container:
  - `<= 10` chars: `30px`
  - `11–13` chars: `25px`
  - `14–16` chars: `21px`
  - `17+` chars: `18px`
- In `packages/web/src/features/gameplay/GameplayView.tsx`, add `connectToken === null` to `useKeyboard({ enabled: ... })` (alongside existing `!showAuth`) so typing while `ConnectBanner` is open never alters the board underneath.
- In `packages/web/src/features/gameplay/useKeyboard.ts`:
  - Update `LETTER_PATTERN` to `/^[a-zåäö-]$/` to match `FINNISH_LETTERS`.
  - Ignore global `Enter` and `Space` shortcuts when `event.target` is inside `button, [role="button"], a[href], select` so focused buttons and hex cells activate cleanly without double-submit or unintended shuffle.

### C. Honeycomb Accessibility (`Honeycomb.tsx`, `tokens.css`)

- In `packages/web/src/features/gameplay/Honeycomb.tsx`:
  - Replace `role="img"` on `<svg>` with `role="group"` while retaining the descriptive `aria-label`.
  - Remove `aria-hidden="true"` from the 7 interactive `<g>` cells; add `role="button"`, `tabIndex={disabled ? -1 : 0}`, `aria-label` (`Keskuskirjain X` / `Kirjain X`), `aria-disabled={disabled || undefined}`, `:focus-visible` indicator styling, and `onKeyDown` handling `Enter` and `Space` (`preventDefault` + `stopPropagation` + brief press flash + `onLetterPress`). Keep child `<polygon>`, `<path>`, and `<text>` `aria-hidden="true"`.

### D. Active-Play `elapsed_ms` Across Closed Tabs & Synced Devices (`useGameTimer.ts`, `storage.ts`, `useGameStore.ts`, `sync-reconcile.ts`)

- Extend `PersistedPuzzleState` in `packages/web/src/features/gameplay/storage.ts` with optional `lastActiveAt?: number`.
- In `packages/web/src/features/gameplay/useGameTimer.ts`, invoke `onSync` on `pause` (`visibilitychange` hidden, `blur`, `pagehide`) as well as `resume`, so backgrounded or closed sessions persist `totalPausedMs` and `lastActiveAt`.
- In `packages/web/src/features/gameplay/useGameStore.ts`:
  - Stamp `lastActiveAt: Date.now()` in `saveState()`.
  - On `loadState()`, when `saved.lastActiveAt` exists and `now > saved.lastActiveAt`, fold the closed-tab idle gap (`now - saved.lastActiveAt`) into `totalPausedMs` and persist the updated `totalPausedMs` + `lastActiveAt = now` before calling `recordLocalStatsUpdate`.
- In `packages/web/src/features/player-sync/sync-reconcile.ts`:
  - When `pullAndMergeData` hydrates a remote `puzzle_state` that has an accompanying `StatsRecord.elapsed_ms` and no prior local `lastActiveAt`, rebase `totalPausedMs = Math.max(totalPausedMs, Date.now() - startedAt - statsRecord.elapsed_ms)` and stamp `lastActiveAt = Date.now()` so opening a puzzle hours later on a second device does not inflate `elapsed_ms` with wall-clock time between devices.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **UI Interaction (`tests/unit/gameplay-flow.test.tsx`, `tests/unit/GameplayInputAndA11y.test.tsx`, `tests/unit/StatsModal.achievements.test.tsx`):**
  - `FoundWords` renders canonical hyphenated lemmas (e.g. `aamu-uninen`) for normalized stored entries (`aamuuninen`) while keeping Kotus links and `lastResubmittedWord` highlights intact; `StatsModal` renders `Pisin sana` via `getCanonicalLemma`.
  - `WordInput` steps down font size for 15–19 letter words while preserving `38px` container height.
  - Opening `ConnectBanner` (`connectToken`) suppresses board `useKeyboard` inputs; pressing `å` registers when enabled.
  - Each of the 7 `Honeycomb` hex cells exposes `role="button"`, `tabIndex={0}`, and Finnish `aria-label`; pressing `Enter` or `Space` on a focused hex cell inputs that letter without triggering `useKeyboard` board submit or shuffle.
- [x] **Unit / Timer & Sync (`tests/unit/gameplay-store.test.ts`, `tests/unit/sync-reconcile.test.ts`):**
  - Reloading a saved puzzle state hours after `lastActiveAt` excludes the closed-tab idle gap from `elapsedMs` by incrementing `totalPausedMs`.
  - Pulling a remote puzzle state + `StatsRecord.elapsed_ms` onto a fresh device rebases `totalPausedMs` so active `elapsed_ms` is preserved rather than inflated to wall-clock delta since `started_at`.

### Visual & Mechanical Gate

- [x] **Visual Inspection (`pnpm run screenshot stats`):** Baseline (`desktop`, `mobile`) and `stats` (`desktop-stats-summary`, `mobile-stats-summary`) inspected at `390px` and `1280px`.
- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
