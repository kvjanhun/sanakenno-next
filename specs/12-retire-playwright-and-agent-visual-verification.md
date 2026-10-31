# Spec 12: Retire Playwright, Clean Up Test Ports & Enforce Agent Visual Verification

Status: shipped
Branch: spec/12-retire-playwright-and-agent-visual-verification
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/tests/e2e/`
- `/Users/erezac/Projects/sanakenno/playwright.config.js`
- `/Users/erezac/Projects/sanakenno/.github/workflows/ci-web.yml`

## 1. Objective

Completely retire Playwright and ephemeral browser E2E tests, eliminate test port juggling (`API_PORT=3002`, `WEB_PORT=5174`), migrate remaining user flows to fast, in-process React Testing Library tests under Vitest, and mandate agent-first visual verification (headless screenshots inspected via multimodal `read_file`) for all UI and styling changes.

## 2. Invariants & Non-Goals

- **Zero Loss of Functional Confidence:** All meaningful user interactions previously asserted in Playwright (keyboard word input, Enter submission, rank/score increments, Kotus dictionary links, `localStorage` restoration, modal interactions, and admin flows) must be verified via fast, deterministic React Testing Library tests in `tests/unit/`.
- **Zero Browser Overhead in CI:** CI must run purely in Node via `pnpm run check:agent`. Remove all Playwright browser binary downloads (`playwright install-deps chromium`) and ephemeral dev servers from CI.
- **Visual Bugs Require Visual Inspection:** CSS, layout, spacing, and mobile viewport constraints cannot be reliably asserted with string or DOM selectors. Coding agents must inspect real rendered screenshots (desktop + mobile) using `read_file` before submitting UI changes.
- **No Golden Image Pixel-Diff Tools (Non-Goal):** Do not introduce brittle pixel-matching snapshot tools (e.g. Percy, BackstopJS, or Playwright visual snapshots) that litter git with PNG diffs. Visual curation belongs to the authoring agent and the independent critic subagent.
- **Port Simplification:** Clean up test-only port variables (`API_PORT`, `WEB_PORT`, `:3002`, `:5174`) so Vite and Hono dev servers use standard, predictable ports (`:5173` and `:3001`).

## 3. Contract & Architecture

### A. Playwright & Port Juggling Removal

1. **Delete Test & Config Files:**
   - Delete `tests/e2e/` (`admin.spec.ts`, `gameplay.spec.ts`, `modals-theme.spec.ts`, `pwa.spec.ts`).
   - Delete `playwright.config.ts`.
2. **Remove Dependencies & Scripts:**
   - Remove `@playwright/test` and `playwright` from root `package.json` devDependencies.
   - Remove `"test:e2e": "playwright test"` script from `package.json`.
   - Update `pnpm-lock.yaml` via `pnpm install`.
3. **Clean Up Dev & Test Ports:**
   - In `packages/web/vite.config.ts`, simplify the proxy and server configuration to standard defaults (`:5173` web proxying to `:3001` API) without test-port env overrides.
4. **Clean Up GitHub Actions CI (`.github/workflows/ci-web.yml`):**
   - Remove Playwright version extraction, browser caching, browser installation, OS dependencies, and `pnpm run test:e2e`.
   - CI check job consists strictly of `pnpm run check:agent`.

### B. Conventional Test Suite (Vitest + React Testing Library)

Fill all functional gaps left by Playwright removal with in-process component tests:

1. **Integrated Gameplay Flow (`tests/unit/gameplay-flow.test.tsx`):**
   - Render gameplay shell with `QueryClientProvider` and `useGameStore`.
   - Simulate typing valid and invalid words via keyboard and honeycomb buttons.
   - Assert score updates, rank progression, and Kotus dictionary link generation in the DOM.
   - Simulate page reload / remount: verify progress and found words are restored from `localStorage`.
2. **Theme & Modal Flows:**
   - Verify existing coverage in `tests/unit/modals-theme-rollover.test.tsx` (Settings, Rules, Stats, Archive modal selection, and theme/palette toggles).
3. **Admin Panel Flow:**
   - Verify existing coverage in `tests/unit/admin-puzzle-editor.test.tsx` and `tests/integration/admin-puzzles.test.ts`.
4. **PWA & Offline Configuration:**
   - Verify existing coverage in `tests/unit/pwa-config.test.ts` (manifest icons, metadata, and Workbox navigation fallback denylist).

### C. Headless Screenshot Capture (`scripts/screenshot.ts`)

Introduce a lightweight, dependency-free utility script `scripts/screenshot.ts` (runnable via `pnpm run screenshot`):

1. **Execution Mode:**
   - Connects to local Chrome (`/Applications/Google Chrome.app`) headless CLI or minimal runner.
   - Captures full-height screenshots of the running app at:
     - **Desktop:** `1280 × 800`
     - **Mobile:** `390 × 844` (iPhone viewport)
   - Saves images to `.screenshots/desktop.png` and `.screenshots/mobile.png` (gitignored).
2. **Multimodal Agent Inspection:**
   - Agents read generated PNGs using `read_file`.
   - Agents check:
     - Mobile viewport overflow: ensure honeycomb, word input, and controls fit without unexpected scrollbars.
     - Spacing and typographic alignment in both light and dark themes.
     - No clipped text or overlapping controls.

### D. Agent Operating Rules & Guardrails Fill-In

1. **Update `AGENTS.md` (and symlinks `CLAUDE.md`, `GEMINI.md`):**
   - Remove references to `pnpm run test:e2e` in Laws and Commands.
   - Add **Law 6: Mandatory Agent Visual Verification for UI Changes:**
     - Whenever a slice touches `.tsx` files, CSS stylesheets, or Tailwind tokens, the agent MUST run `pnpm run screenshot` and visually inspect the output using `read_file`.
     - The Curation Brief must include confirmation that mobile and desktop screenshots were inspected.
2. **Update `.agent/skills/critic-audit/SKILL.md`:**
   - Add audit item: *"If the slice touches UI components or styling, verify that the builder agent visually verified mobile (390px) and desktop screenshots and checked for layout shifts and overscroll."*
3. **Update `specs/TEMPLATE.md` & `PROJECT_MAP.md`:**
   - Replace Playwright E2E checklist item with React Testing Library and Visual Screenshot Verification.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit / Domain: `tests/unit/gameplay-flow.test.tsx` passes in Vitest, verifying keyboard input, word submission, score updates, Kotus link, and `localStorage` reload without a browser.
- [x] Conventional Coverage: All former Playwright scenarios (gameplay, modals, theme, admin, pwa) pass under `pnpm run test:unit` in <5 seconds.
- [x] Clean Deletion: `tests/e2e/`, `playwright.config.ts`, `@playwright/test`, and `playwright` removed from the repository.
- [x] Port Simplification: `packages/web/vite.config.ts` simplified with test port juggling removed.
- [x] Screenshot Utility: `pnpm run screenshot` successfully captures desktop and mobile PNGs into `.screenshots/`.
- [x] Guardrails Updated: `AGENTS.md`, `critic-audit/SKILL.md`, `specs/TEMPLATE.md`, and `PROJECT_MAP.md` encode mandatory agent visual verification.
- [x] CI Streamlined: `.github/workflows/ci-web.yml` runs without Playwright browser installation; `pnpm run check:agent` passes 100% in CI.
