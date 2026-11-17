# Spec 28: Agent Harness, Screenshot Runner & Skill Alignment

Status: shipped
Branch: spec/28-agent-harness-and-screenshot-runner

## 1. Objective

Harden the agent-first development pipeline before executing subsequent feature and security slices: refactor `scripts/screenshot.ts` to auto-start both `@sanakenno/server` and `@sanakenno/web` (with deterministic DB seeding) while reusing a single headless Chrome CDP session and splitting target scenarios into `scripts/screenshot-targets.ts`; include `scripts/` in the 500-line ceiling check in `tests/architecture.test.ts`; archive shipped specs `21`–`27` into `specs/archive/`; and reconcile `.agent/skills/*` so `execute-spec`, `critic-audit`, and `curate-accept` have zero contradictions or stale commands.

## 2. Invariants & Non-Goals

### Invariants
1. **500-Line Ceiling Across `packages/`, `tests/`, and `scripts/`:**
   - `tests/architecture.test.ts` must enforce `MAX_LINES_PER_FILE = 500` on all `.ts` and `.tsx` files in `packages/`, `tests/`, and `scripts/`.
2. **Self-Contained Visual Verification (`pnpm run screenshot`):**
   - Running `pnpm run screenshot` when no dev servers are running must automatically start `@sanakenno/server` (`:3001`, with `SEED_ON_BOOT=true` if needed) and `@sanakenno/web` (`:5173`), wait for both `/api/health` and the web root to respond `200`, capture all mobile (`390x844`) and desktop (`1280x800`) targets by reusing a single headless Chrome instance via Chrome DevTools Protocol (CDP), and cleanly terminate any child processes it spawned.
3. **Strict Critic Audit (`## 3` + `## 4` + Visual Proof):**
   - `.agent/skills/critic-audit/SKILL.md` must require verifying **both** `## 3. Contract & Architecture` and `## 4. Acceptance Criteria` against implementation and tests, and must require reading `.screenshots/mobile.png` and `.screenshots/desktop.png` via `read_file` whenever UI/CSS files are touched.
4. **Clean Spec Backlog & Archive Hygiene:**
   - All previously `shipped` specs (`21` through `27`) are moved to `specs/archive/` with updated links in `specs/00-backlog.md`, leaving only active/upcoming specs in the `specs/` root directory.

### Non-Goals
- Changing any application runtime behavior in `@sanakenno/shared`, `@sanakenno/server`, or `@sanakenno/web`.
- Re-introducing Playwright or external browser automation dependencies.

## 3. Contract & Architecture

### A. Screenshot Runner Decomposition & Single-Browser CDP (`scripts/screenshot.ts` & `scripts/screenshot-targets.ts`)
- Extract target definitions and DOM evaluation expressions from `scripts/screenshot.ts` into `scripts/screenshot-targets.ts` (`ScreenshotTarget` interface + `SCREENSHOT_TARGETS` array), keeping both files well under 250 lines.
- Update `scripts/screenshot.ts`:
  - Check both API server (`http://localhost:3001/api/health`) and web server (`http://localhost:5173`).
  - If `:3001` is not running, spawn `pnpm --filter @sanakenno/server dev` with `SEED_ON_BOOT=true` and wait for `/api/health` (`200 OK`).
  - If `:5173` is not running, spawn `pnpm --filter @sanakenno/web dev` and wait for `http://localhost:5173`.
  - Spawn a **single** headless Chrome process on a free remote-debugging port and iterate through `SCREENSHOT_TARGETS` over CDP (resetting `localStorage`, theme attributes, and navigating to `url` per target), cutting total screenshot runtime dramatically.
  - Ensure `finally` kills any spawned Chrome, web, and API child processes cleanly.

### B. Architectural Fitness Guardrails (`tests/architecture.test.ts`)
- Expand the `keeps every source and test file under the 500-line monolith ceiling` test to walk `packages/`, `tests/`, and `scripts/` (`.ts`, `.tsx`).
- Add a guardrail verifying that every `.agent/skills/*/SKILL.md` file exists, contains valid YAML frontmatter (`name`, `description`), and never references retired scripts (such as `test:e2e`).

### C. Spec Archive & Skill Alignment (`specs/` & `.agent/skills/`)
- Move `specs/21-*.md` through `specs/27-*.md` into `specs/archive/` and update their links in `specs/00-backlog.md`.
- Update `.agent/skills/execute-spec/SKILL.md`:
  - Remove the stale `pnpm run test:e2e` reference and replace with `pnpm --dir /Users/erezac/Projects/sanakenno-next run screenshot` (when UI/CSS is touched).
  - Clarify that moving a newly `shipped` spec to `specs/archive/` happens when finalizing the slice.
- Update `.agent/skills/critic-audit/SKILL.md`:
  - Require checking every requirement in **both** `## 3. Contract & Architecture` and `## 4. Acceptance Criteria`.
  - Require the critic subagent to call `read_file` on `.screenshots/mobile.png` and `.screenshots/desktop.png` when UI or styling changes are present.
- Update `.agent/skills/curate-accept/SKILL.md`:
  - Align with trunk-based continuous execution (no mandatory git branch merges between slices; move shipped spec file to `specs/archive/` and update `specs/00-backlog.md`).

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Architecture Fitness (`tests/architecture.test.ts`):**
  - `scripts/` `.ts` files are checked against the 500-line ceiling (`scripts/screenshot.ts` and `scripts/screenshot-targets.ts` both <250 lines).
  - `.agent/skills/*/SKILL.md` files are mechanically validated for frontmatter and absence of retired `test:e2e` references.
  - Archived specs `21`–`27` in `specs/archive/` pass the `specs/00-backlog.md` synchronization check.
- [ ] **Unit (`tests/unit/screenshot-targets.test.ts`):**
  - Validates that `SCREENSHOT_TARGETS` includes both desktop (`1280x800`) and mobile (`390x844`) baseline targets, light/dark variants, and unique output filenames.
- [ ] **Visual & Mechanical Gate:**
  - `pnpm run screenshot` succeeds end-to-end and generates non-empty PNGs in `.screenshots/`.
  - `pnpm run check:agent` passes 100%.
