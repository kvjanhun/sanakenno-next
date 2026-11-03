# Spec 17: 0–100% Rank Progress Bar with High-Contrast Notches & Top Modal Blips

Status: shipped
Branch: spec/17-rank-progress-and-unassisted-blips
Reference (1.0): N/A (Sanakenno 2.0 UX refinement)

## 1. Objective

Upgrade the gameplay header's rank progress bar to a continuous 0–100% puzzle progress bar (`score / maxScore * 100`) with high-contrast rank stripes/notches (2%, 10%, 20%, 40%, 70%) using 2px clean gap cuts. Move the 3 unassisted milestone indicators back to their companion position beside the progress bar (calm neutral/tertiary tone when open, bright accent only when reached, and dimmed grey when lost). When the rank progress modal opens, move the "Ilman apuja" summary section from the bottom to the top of the modal, creating natural visual continuity.

## 2. Invariants & Non-Goals

### Invariants
- **Domain single-source-of-truth:** Ranks (`RANKS`), no-hint milestones (`NO_HINT_ACHIEVEMENTS`), and their percentage thresholds remain in `@sanakenno/shared`.
- **Test ID & Attribute Contract:** Preserve `data-testid="score-display"`, `data-testid="rank-button"`, `data-testid="milestone-pip-25"`, `data-testid="milestone-pip-50"`, `data-testid="milestone-pip-70"`, and `data-state="reached|lost|open"` on the milestone nodes for test compatibility.
- **Strict Theme Token Usage:** All colors must use CSS custom properties (`var(--color-accent)`, `var(--color-bg-secondary)`, `var(--color-bg-primary)`, `var(--color-border)`, etc.) — no hardcoded hex strings in `.tsx`.
- **Responsive Layout:** Must fluidly fit the gameplay column (up to 440px on desktop, full width with margins on mobile viewports).

### Non-Goals
- **No Percentage Labels Under Bar:** No text numbers like "0%", "25%", "50%", "70%", "100%" underneath the bar; the bar remains clean and minimal.
- **Score calculation:** Scoring words, recalculating scores, and points counts are strictly untouched.
- **Hint unlocking logic:** No changes to `useGameStore` or hint unlock actions.

## 3. Contract & Architecture

### Frontend Slice (`@sanakenno/web`)

#### `packages/web/src/features/gameplay/RankProgress.tsx`
- **Continuous 0–100% Bar:**
  ```ts
  const totalProgress = maxScore > 0 ? Math.min(100, Math.max(0, (score / maxScore) * 100)) : 0;
  ```
- **Prominent Tactile Bar Styling:**
  - 12px height (`h-3`), 1px border (`var(--color-border)`), and inset shadow (`inset 0 1.5px 3px rgba(0, 0, 0, 0.12)`).
  - Progress fill features a subtle vertical lighting gradient over `var(--color-accent)` (`linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(0, 0, 0, 0.08) 100%)`) providing an enamel game feel.
- **High-Contrast Rank Stripes:**
  - Placed inside the progress bar at intermediate ranks: 2% (*Hyvä alku*), 10% (*Nyt mennään!*), 20% (*Onnistuja*), 40% (*Sanavalmis*), 70% (*Ällistyttävä*).
  - Styled as 2px vertical cuts using `var(--color-bg-primary)` with `z-10`, providing clear, crisp separation across both track and fill.
- **Companion Achievement Blips & Zero Duplication:**
  - In closed state, the 3 companion achievement blips sit beside the bar (`flex items-center gap-1 shrink-0`, size 14).
  - States:
    - **`open`**: Calm neutral tone (`var(--color-text-tertiary)`, `CircleIcon` 12px), NOT bright accent right away.
    - **`reached`**: Bright accent (`var(--color-accent)`, `CircleStarIcon` 14px).
    - **`lost`**: Dimmed grey (`CircleOffIcon` 13px).
- **Integrated Dropdown Modal (`showRanks`):**
  - When opened, the bar expands across full width and companion blips are not duplicated beside the bar.
  - The "Ilman apuja" summary section sits at the **top** of the modal (immediately above the `<ul>` of ranks).
  - Displays `{scoreBeforeHints} p. ilman apuja` and the enlarged achievement icons (26px) with zero duplication.

## 4. Acceptance Criteria (Test Catalog)

- [x] **Unit Tests (`tests/unit/RankProgress.test.tsx`):**
  - **0–100% Total Progress:** Progress bar width reflects total puzzle percentage `(score / maxScore) * 100`.
  - **High-Contrast Rank Stripes:** Verifies all 5 intermediate rank notches are rendered (2%, 10%, 20%, 40%, 70%) with `data-testid="rank-notch-*"`.
  - **Milestone Blip Placement:** Verifies 3 milestone blips sit in the companion container beside the progress bar with `data-testid="milestone-pip-25|50|70"`.
  - **State Transitions:**
    - `open`: Score is below milestone and hints are not unlocked (calm neutral tertiary styling, not bright accent).
    - `reached`: Score reaches or exceeds milestone without hints unlocked (accent fill + star icon).
    - `lost`: Hints are unlocked before score reaches milestone (unavailable muted grey with discreet slash).
  - **No Percentage Labels:** Asserts no percentage labels ("0%", "25%", "50%", etc.) are rendered in the DOM below or near the progress bar.
  - **Top-Positioned Modal Header & Enlarged Stars:** When rank button is toggled, the "Ilman apuja" row is rendered at the top of the panel before the ranks list, displaying enlarged stars (26px) with zero duplicate stars beside the bar.
- [x] **Architecture Gate (`pnpm run test:arch`):**
  - No files exceed 500 lines.
  - Design tokens strictly respected.
- [x] **Mechanical Gate (`pnpm run check:agent`):**
  - Typecheck, ESLint, architecture tests, unit tests, and production build pass 100%.
- [x] **Visual Inspection (`pnpm run screenshot`):**
  - Capture desktop (1280px) and mobile (390px) screenshots to `.screenshots/`.
  - Visually inspect stripe contrast, blip positioning, and modal top layout.
