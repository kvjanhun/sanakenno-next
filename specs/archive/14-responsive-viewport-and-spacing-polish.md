# Spec 14: Responsive Viewport & Spacing Polish

Status: shipped
Branch: spec/14-responsive-viewport-and-spacing-polish
Reference (1.0): /Users/erezac/Projects/sanakenno/packages/web/src/App.tsx

## 1. Objective

Refactor the gameplay screen layout to adapt seamlessly across diverse mobile viewport widths (including modern 402px+ devices like iPhone 16/17 Pro and 430–440px Plus/Max phones) while maintaining a strict desktop max-width ceiling (~440px) so the interface remains cohesive, comfortably spread, and vertically aligned.

## 2. Invariants & Non-Goals

- **Invariants:**
  - Desktop viewports (>440px) must never allow the puzzle UI to stretch out unboundedly; maximum container width must remain bounded at ~440px (`max-w-[440px]` or `max-w-md`), horizontally centered with `mx-auto`.
  - Mobile devices across all resolutions (from 320px up to 440px) must use available horizontal screen real estate cleanly, with consistent edge margins and without artificial double-gutters or clipping.
  - The visual left edge of the header icons (Calendar), score counter ("X pistettä"), progress bar, hint deck, and found words counter must align to the exact same vertical guide.
  - The visual right edge of the header icons (Settings), rank badge, progress bar, hint collapse chevron, and found words toggle must align to the exact same vertical guide.
  - Header styling: retains edge-to-edge `border-b border-[var(--color-border)]` framing the title bar.
- **Non-Goals:**
  - No changes to Finnish game scoring, word validation, or puzzle generation logic.
  - No changes to admin layout or backend database tables.

## 3. Contract & Architecture

- **Shared Schemas / Logic (`@sanakenno/shared`):**
  - No shared domain changes needed.
- **Kysely Queries (`@sanakenno/server`):**
  - No database changes needed.
- **Hono RPC Routes (`@sanakenno/server`):**
  - No API changes needed.
- **Frontend Slice (`@sanakenno/web`):**
  - `GameplayView.tsx`:
    - Retain edge-to-edge `border-b` on `<header>`.
    - Update both `<header>` inner container and `<main>` inner container to use `w-full max-w-[440px] mx-auto px-3.5 sm:px-4`.
    - Adjust header icon button positioning and touch targets so icon SVG centers align with the content boundary.
  - `RankProgress.tsx`:
    - Ensure progress bar track and score/rank row stretch edge-to-edge across the container with consistent spacing.
  - `HintPanels.tsx`:
    - Ensure hint deck toolbar and cards span the container width with matching horizontal bounds.
  - `FoundWords.tsx`:
    - Remove the unaligned `pl-2` on the count text so the label aligns with the score text above it.
  - `GameControls.tsx` & `Honeycomb.tsx`:
    - Maintain centered, touch-friendly proportions; ensure resilient rendering on viewports down to 320px.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit / Domain: Existing gameplay stores and utility tests continue to pass without regression.
- [ ] Conventional UI (React Testing Library in Vitest):
  - Header, score, progress bar, hint deck, and found words render within unified container boundaries.
  - Header retains edge-to-edge border-b framing line.
- [ ] Visual Inspection (`pnpm run screenshot` mobile + desktop):
  - Mobile screenshot (390px / 402px) shows UI elements utilizing screen real estate cleanly with consistent left/right margins.
  - Desktop screenshot (1280px) verifies the puzzle remains bounded at 440px max-width, cleanly centered on the screen.
