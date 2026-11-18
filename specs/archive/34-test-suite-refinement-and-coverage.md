# Spec 34: Test Suite Refinement, Static Dictionary Pruning & Gap Coverage

Status: shipped
Branch: spec/34-test-suite-refinement-and-coverage

## 1. Objective

Improve the signal-to-noise ratio and honesty of `tests/`: stop reading static dictionary assets (`kotus_words.txt`, `nykysuomensanalista2024.txt`) during standard test runs, prune brittle CSS/Tailwind/line-count assertions in favor of behavioral and visual verification, fix swallowed network calls and React `act(...)` noise, and close real coverage gaps in auth/sync initialization, API clients, transfer emails, scroll boundary guarding, and admin puzzle force-saves.

## 2. Invariants & Non-Goals

### Invariants

- **Zero Static Dictionary Churn in Normal Runs:** Standard `pnpm run test:unit` and `pnpm run check:agent` runs must never read or parse the full `kotus_words.txt` or `nykysuomensanalista2024.txt` files unless explicitly verifying a production snapshot (`PROD_DB_SNAPSHOT`). Wordlist parsing and puzzle computation remain tested via small isolated fixtures (`tests/unit/wordlist.test.ts` and the synthetic TSV fixture in `tests/unit/filter-kotus-wordlist.test.ts`).
- **Behavioral Signal Over CSS/Line-Count Trivia:** Remove tests that regex-grep CSS/TSX files, assert Tailwind spacing/width utility classes, assert inline CSS styling tokens, or duplicate the 500-line ceiling already enforced by `tests/architecture.test.ts`. Retain the `packages/web/index.html` pinch-to-zoom viewport meta check inside `tests/architecture.test.ts`.
- **No Silent Network Rejections or React `act(...)` Warnings:** Every test file must clean up async effects and stub HTTP boundaries (`globalThis.fetch` or module clients) explicitly rather than letting relative browser fetches fail silently.

### Non-Goals

- Changing production application logic in `packages/shared`, `packages/server`, or `packages/web` (this slice refactors and adds tests only).
- Adding RTL tests for thin/internal admin views (`AdminLayout.tsx`, `CombinationsBrowser.tsx`, `WordData.tsx`, `WordFinds.tsx`) or `App.tsx`.

## 3. Contract & Architecture

### A. Eliminate Static Dictionary Churn (`kotus_words.txt` / `nykysuomensanalista2024.txt`)

- **`tests/unit/HintMatrixTable.test.tsx`:** Remove the `kotus_words.txt` word-length discovery test; rely on explicit `activeLengths` fixtures in component tests.
- **`tests/unit/filter-kotus-wordlist.test.ts`:** Remove the full `nykysuomensanalista2024.txt` count test (`102659`, `1246`); keep the synthetic TSV fixture test covering prefixes, suffixes, digits, spaces, short words, non-breaking hyphens, and invalid characters.
- **`tests/integration/production-snapshot.test.ts`:** Move `Kotus Wordlist Snapshot Verification` (`loadWordlist(KOTUS_WORDS_PATH)`) inside the `describe.skipIf(!hasProdDbSnapshot)` suite so full-asset verification only executes alongside a production DB snapshot.
- **`tests/integration/server-lifecycle.test.ts`, `tests/integration/telemetry.test.ts`, `tests/integration/player-sync.test.ts`, `tests/integration/player-sync-hardening.test.ts`, `tests/integration/db-parity.test.ts`:** Seed explicit in-memory wordlists via `setWordlist(...)` in `beforeEach` (and reset in `afterEach`) so `ensureWordlist()` / `ensureBootSeed()` never trigger disk reads of `kotus_words.txt` in isolated Vitest workers.

### B. Prune Brittle CSS/Line-Count Tests & Clean `act(...)` Noise

- **`tests/unit/accessibility-zoom.test.tsx` & `tests/architecture.test.ts`:** Delete `tests/unit/accessibility-zoom.test.tsx` (dropping `tokens.css`/`Honeycomb.tsx` regexes and `text-base` class checks) and add a static check in `tests/architecture.test.ts` ensuring `packages/web/index.html` viewport meta omits `user-scalable=no` and `maximum-scale=1.0`.
- **`tests/unit/screenshot-targets.test.ts`:** Remove `< 250` line-count assertions (`runnerLines`, `targetsLines`); keep `selectScreenshotTargets()` and `buildTargetActionSteps()` behavior tests.
- **`tests/unit/gameplay-flow.test.tsx`:** Remove the Spec 14 Tailwind container class-string test (`max-w-[440px]`, `px-3.5`, `-ml-2.5`, `-mr-2.5`).
- **`tests/unit/GameplayComponents.test.tsx`:** Remove the Spec 14 spacing class-string test (`pl-2`, `px-0.5`, `gap-2.5 sm:gap-3`), and simplify the Honeycomb shuffle test to assert behavioral state/rendering (all 7 letters stay rendered across rapid shuffles) without hardcoded `cubic-bezier(...)` animation strings.
- **`tests/unit/HintMatrixTable.test.tsx`:** Remove Tailwind width/alignment class and pixel style assertions (`w-[28px]`, `w-[32px]`, `width: '17px'`, `left: '60px'`, `items-start`, `w-max`); keep behavioral checks (empty length/letter columns omitted, unrevealed overlay triggers `onUpgrade`).
- **`tests/unit/RankProgress.test.tsx`:** Remove inline style/class assertions (`width: '1px'`, `height: '15px'`, `borderColor`, `boxShadow`, `h-7 w-7`); keep progressbar ARIA attributes, score/rank text, milestone pip `open`/`reached`/`lost` transitions, single pip set on modal open, and absence of percentage labels.
- **`tests/unit/AnnouncementBanner.test.tsx`:** Remove Tailwind class regexes (`truncate|text-ellipsis|whitespace-nowrap`) and CSS positioning/border string checks (`position: absolute`, `borderLeft` px values); keep FIFO queueing, click dismissal, auto-dismiss timers, `showRanks` suppression, and `window.sanakennoAnnounce` lifecycle.
- **`tests/unit/player-sync-components.test.tsx`:** Remove `.inline-grid` CSS class checks and resolve the `not wrapped in act(...)` warning in the `SyncModal` unlink test by settling the initial `requestTransferTicket()` effect cleanly.

### C. Fix Dishonest Tests & Close High-Value Coverage Gaps

- **`tests/unit/admin-store.test.ts` (`useAdminStore.ts`):** Stub `globalThis.fetch` so `logout()` exercises `/api/auth/logout` cleanly instead of swallowing a relative-URL rejection, and add tests for `checkSession()` (`200` vs `401`/network failure) and `login()` (success setting `csrfToken` vs server error message).
- **`tests/unit/api-clients.test.ts` (`packages/web/src/api/client.ts` & `admin-client.ts`):** New focused unit test stubbing `globalThis.fetch` to verify `Authorization: Bearer` headers, `X-CSRF-Token` + `credentials: 'same-origin'` on admin calls, `readErrorMessage` JSON/fallback errors, `adminSavePuzzle` `requires_force` error propagation, and `adminGetSlots` fallback behavior.
- **`tests/unit/player-sync-store.test.ts` (`useAuthStore.ts`):** Add tests for `initialize()` and `initPlayer()` covering first-boot local progress upload, expired-session re-initialization without losing local stats, and startup pull+merge+local-ahead push dispatching `sanakenno:sync-reload` only when state changed.
- **`tests/unit/send-transfer-link.test.ts` (`packages/server/src/features/player-auth/send-transfer-link.ts`):** New unit test stubbing `globalThis.fetch` to verify no-op when `RESEND_API_KEY` is unset/`"test"`, Resend `/emails` request payload and URL-encoded transfer link when configured, and error propagation on non-2xx responses.
- **`tests/unit/scroll-boundary-guard.test.tsx` (`packages/web/src/features/gameplay/useScrollBoundaryGuard.ts`):** New unit test simulating touch gestures to verify horizontal swipe passthrough, `preventDefault()` on non-scrollable targets, and top/bottom overscroll blocking vs. mid-scroll allowance.
- **`tests/unit/admin-puzzle-editor.test.tsx` (`PuzzleEditor.tsx`):** Add tests for the `requires_force` save error/retry flow (`force: true`) and variation center selection saving via `adminSavePuzzle`.

## 4. Acceptance Criteria & Verification

All changes are strictly in `tests/` (no production code changes), so all verification targets `tests/`.

### New / Updated Tests (real boundaries, not mock-only)

- [ ] **Architecture (`tests/architecture.test.ts`):** Enforces that `packages/web/index.html` viewport meta tag omits `user-scalable=no` and `maximum-scale=1.0`, while `tests/unit/accessibility-zoom.test.tsx` is removed.
- [ ] **Unit / Store & API Clients (`tests/unit/admin-store.test.ts`, `tests/unit/api-clients.test.ts`, `tests/unit/player-sync-store.test.ts`):** Stub `globalThis.fetch` cleanly (no swallowed relative-URL fetches) and prove `useAdminStore.{checkSession,login,logout}`, `client.ts`/`admin-client.ts` auth/CSRF/error handling, and `useAuthStore.{initialize,initPlayer}` first-boot, expired-token, and reconciliation flows.
- [ ] **Unit / Server Email & Touch Guard (`tests/unit/send-transfer-link.test.ts`, `tests/unit/scroll-boundary-guard.test.tsx`):** Prove Resend email payload/error handling and touch overscroll boundary prevention vs. horizontal/mid-scroll passthrough.
- [ ] **UI Interaction (`tests/unit/admin-puzzle-editor.test.tsx`, `tests/unit/player-sync-components.test.tsx`):** Prove `PuzzleEditor` `requires_force` + center-change save flows and run `SyncModal` unlink flows with zero `act(...)` warnings.
- [ ] **Hygiene (`tests/unit/HintMatrixTable.test.tsx`, `tests/unit/filter-kotus-wordlist.test.ts`, `tests/integration/production-snapshot.test.ts`, `tests/integration/server-lifecycle.test.ts`, `tests/integration/telemetry.test.ts`, `tests/integration/player-sync.test.ts`, `tests/integration/player-sync-hardening.test.ts`, `tests/integration/db-parity.test.ts`):** Standard `pnpm run test:unit` completes without reading `kotus_words.txt` or `nykysuomensanalista2024.txt` from disk.

### Visual & Mechanical Gate

- [ ] **Mechanical Gate:** `pnpm run check:agent` passes 100% with zero React `act(...)` stderr warnings and improved coverage across `useAuthStore.ts`, `useAdminStore.ts`, `client.ts`, `admin-client.ts`, `send-transfer-link.ts`, and `useScrollBoundaryGuard.ts` (`pnpm run test:coverage`).
