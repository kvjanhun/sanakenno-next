# Spec 33: Spec Precedence Guardrails, Selective Modal Screenshots & Sync API Cleanup

Status: shipped
Branch: spec/33-spec-precedence-selective-screenshots-and-sync-cleanup

## 1. Objective

Resolve the post-review findings from Specs 28–32 and prevent future spec archaeology regressions:
1. Codify **Spec Precedence (Newer Wins)** in `AGENTS.md`, `PROJECT_MAP.md`, and `.agent/skills/*` so archived specs in `specs/archive/` are treated strictly as point-in-time history and never override newer specs or commits on `main`.
2. Restore the intentional removal of `achievement_progress` gameplay announcements (`d5a1c0a`) and align archived specs `27` and `29`.
3. Upgrade `scripts/screenshot.ts` and `scripts/screenshot-targets.ts` so `pnpm run screenshot` runs fast baseline targets by default and accepts selective area/modal filters (including new `settings`, `sync`, and `rules` modal targets) so agents only capture and inspect the UI surfaces affected by a change.
4. Remove redundant legacy sync/auth endpoints (`POST /api/player/sync/stats`, `POST /api/player/sync/state`, `POST /api/player/auth/transfer/email`) and unused `sanitizePreferences`, consolidating all incremental progress pushes onto `POST /api/player/sync/progress` (including `is_daily` and `played_at_date` preservation and server-side `StatsRecord` sanitization).
5. Eliminate the iOS PWA blank-screen crash on modal open after Service Worker updates by statically bundling all 6 player modals in `GameplayView.tsx`, enabling `"sideEffects": false` tree-shaking on `@sanakenno/shared` (dropping unused server Zod schemas from the web bundle), and installing a one-shot `vite:preloadError` reload guard in `pwa.config.ts` / `main.tsx`.

## 2. Invariants & Non-Goals

### Invariants
1. **Newer Spec & `main` Precedence Over `specs/archive/`:**
   - `PROJECT_MAP.md`, active `specs/NN-*.md` files, and current tests on `main` are authoritative. Archived specs in `specs/archive/` are historical records; agents and critics must never back-port or re-introduce features from `specs/archive/` that were superseded or removed.
2. **Unlock-Only Achievement Announcements:**
   - `AnnouncementBanner` announces `letter_cleared`, `no_hint_milestone` (25% / 50%), and `achievement_unlocked` (when crossing a tier threshold). Intermediate `achievement_progress` nudges (`"Edistyminen · X / Y"`, `"Kohti: <Tier>"`) must never be queued or rendered.
3. **Selective, Fast Visual Verification (`pnpm run screenshot [filter...]`):**
   - Running `pnpm run screenshot` with no arguments captures the 4 baseline gameplay targets (`desktop`, `desktop-light`, `mobile`, `mobile-light`).
   - Passing area/modal keywords (`pnpm run screenshot settings sync`, `rules`, `archive`, `stats`, `clues`, `matrix`, `announcements`, or `all`) captures the baseline `desktop` + `mobile` targets plus all matching area/modal targets (`desktop-settings`, `mobile-settings`, `mobile-settings-light`, `desktop-sync`, `mobile-sync`, `mobile-sync-light`, `desktop-rules`, `mobile-rules`, etc.).
4. **Single Canonical Progress Sync Endpoint (`POST /api/player/sync/progress`):**
   - Incremental gameplay and startup reconciliation (`pushLocalDataAheadOfServer`) push exclusively via `POST /api/player/sync/progress` (with `is_daily` and `played_at_date` preserved on the server).
   - Redundant legacy endpoints `POST /api/player/sync/stats`, `POST /api/player/sync/state`, and `POST /api/player/auth/transfer/email` are removed (`404`).
   - `mergeAndStoreStatsRecord` sanitizes incoming `StatsRecord` values against the puzzle's `max_score` and word count when the puzzle exists in SQLite.

### Non-Goals
- Changing database table schemas or migrations.
- Modifying admin endpoints.

## 3. Contract & Architecture

### A. Spec Precedence Rules (`AGENTS.md`, `PROJECT_MAP.md`, `.agent/skills/*`)
- In `AGENTS.md` §4 and `.agent/skills/{spec-next,execute-spec,critic-audit}/SKILL.md`:
  - Add an explicit **Spec Precedence (Newer Wins)** rule: newer specs and commits on `main` supersede older specs in `specs/archive/`. Never audit `main` against `specs/archive/` or re-implement superseded behavior from archived specs; update `PROJECT_MAP.md` whenever a domain/UX invariant changes.
- In `PROJECT_MAP.md` §6:
  - State explicitly that `AnnouncementBanner` only emits unlocked achievement tiers (`achievement_unlocked`), letter-cleared callouts (`letter_cleared`), and 25%/50% unassisted milestones (`no_hint_milestone`).

### B. Restore Unlock-Only Achievement Announcements (`announcements.ts`, `AnnouncementBanner.tsx`, `gameplay-effects.ts`)
- Remove `'achievement_progress'` from `AnnouncementCategory` and `AchievementAnnouncement`.
- Remove `isUnlock` from `AchievementAnnouncement` and render `{activeAnnouncement.tierName}` directly in `AnnouncementBanner.tsx`.
- Remove `kindKey === 'progress'` from `triggerConsoleAnnouncement` in `announcements.ts`.
- Remove the `else if (newProg.nextTier)` progress-nudge branch from `handleAcceptedWordEffects` in `gameplay-effects.ts`.
- Update `specs/archive/27-unified-gameplay-announcements.md` and `specs/archive/29-api-spoiler-lock-rate-limit-and-sync-hardening.md` to reflect unlock-only achievement announcements.

### C. Selective Modal-Aware Screenshot Runner (`scripts/screenshot-targets.ts` & `scripts/screenshot.ts`)
- Add modal targets to `SCREENSHOT_TARGETS` in `scripts/screenshot-targets.ts`:
  - `desktop-settings`, `mobile-settings`, `mobile-settings-light` (`action: 'view-settings'` / `'view-settings-light'`)
  - `desktop-sync`, `mobile-sync`, `mobile-sync-light` (`action: 'view-sync'` / `'view-sync-light'`)
  - `desktop-rules`, `mobile-rules`, `mobile-rules-light` (`action: 'view-rules'` / `'view-rules-light'`)
- Add `selectScreenshotTargets(rawArgs?: readonly string[]): ScreenshotTarget[]` in `scripts/screenshot-targets.ts`:
  - Empty args (`[]`): returns the 4 baseline targets (`desktop`, `desktop-light`, `mobile`, `mobile-light`).
  - `['all']`: returns all `SCREENSHOT_TARGETS`.
  - Specific keywords (e.g., `['settings', 'sync']`): returns `desktop`, `mobile`, plus any target whose `name` or `action` contains any keyword.
- Update `scripts/screenshot.ts` to pass `process.argv.slice(2)` to `selectScreenshotTargets`.

### D. Server Sync & Transfer Cleanup (`player-auth.routes.ts`, `player-sync.routes.ts`, `player-sync.queries.ts`, `client.ts`, `sync-reconcile.ts`, `useAuthStore.ts`)
- Remove `POST /auth/transfer/email` from `player-auth.routes.ts` (keeping `POST /auth/transfer/create`).
- Remove `POST /stats` and `POST /state` from `player-sync.routes.ts`, `SyncStatsPayloadSchema` and `SyncStatePayloadSchema` from `@sanakenno/shared`, `sanitizePreferences` from `player-sync.queries.ts`, and `postSyncStats` / `postSyncState` / `syncStatsRecord` / `syncPuzzleState` from `@sanakenno/web`.
- Extend `SyncProgressPayloadSchema` in `packages/shared/src/schemas/player-sync.ts` with optional `is_daily: z.boolean().optional()` and `played_at_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`.
- In `gameplay-effects.ts`, include `is_daily: isDaily` and `played_at_date: getHelsinkiDateString()` in `syncPayload`.
- In `deriveStatsFromProgress` (`player-sync.queries.ts`), populate `is_daily` and `played_at_date`, and in `mergeAndStoreStatsRecord`, sanitize `max_score`, `best_score`, `best_no_hint_score`, `words_found`, `pangrams_found`, and `best_rank` against `getFullPuzzleBySlot(db, incoming.puzzle_number)` when the puzzle exists.
- Refactor `pushLocalDataAheadOfServer` in `sync-reconcile.ts` (and `useAuthStore.ts`) to push local-ahead puzzles via `syncProgress` (`POST /api/player/sync/progress`).

### E. Static Player Modals, `@sanakenno/shared` Tree-Shaking & `vite:preloadError` Guard (`GameplayView.tsx`, `packages/shared/package.json`, `pwa.config.ts`, `main.tsx`)
- Replace `React.lazy()` and `<Suspense>` for `ArchiveModal`, `PuzzleWordsModal`, `RulesModal`, `SettingsModal`, `StatsModal`, and `SyncModal` in `GameplayView.tsx` with static imports so player modals are always resident in memory once the game board loads (preventing 404 chunk rejections when Workbox `skipWaiting()` + `cleanupOutdatedCaches()` purges old modal chunks while the page is open). Keep `AdminLayout` lazy-loaded behind `#/admin` in `App.tsx`.
- Add `"sideEffects": false` to `packages/shared/package.json` so Vite/Rollup tree-shakes server-only Zod schemas out of `@sanakenno/web`, keeping the main bundle under 450 kB even with all 6 player modals statically included.
- Add `installChunkLoadErrorHandler()` in `packages/web/src/pwa.config.ts` and invoke it in `main.tsx` to catch `vite:preloadError` and trigger a single sessionStorage-guarded reload when online.

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Unit / Gameplay Announcements (`tests/unit/AnnouncementBanner.test.tsx`, `tests/unit/useGameStore.achievements.test.ts`):**
  - Verifies that daily streak increments and near-unlock pangram counts (`target - 1`) do **not** enqueue `achievement_progress` announcements, while tier unlocks (`achievement_unlocked`) do.
- [ ] **Unit / Screenshot Target Selection (`tests/unit/screenshot-targets.test.ts`):**
  - `selectScreenshotTargets([])` returns the 4 baseline targets.
  - `selectScreenshotTargets(['settings', 'sync'])` returns baseline `desktop` + `mobile` plus `settings` and `sync` modal targets.
  - `selectScreenshotTargets(['all'])` returns the full catalog including `settings`, `sync`, and `rules`.
- [ ] **Integration & Unit / Sync Cleanup (`tests/integration/player-sync.test.ts`, `tests/integration/player-sync-hardening.test.ts`, `tests/unit/player-sync-store.test.ts`):**
  - `POST /api/player/sync/progress` merges state + stats monotonically, preserves `is_daily` and `played_at_date`, and strips invalid words / caps tampered scores.
  - `POST /api/player/auth/transfer/use` caps tampered `stats` records against the puzzle's true `max_score`.
  - Removed legacy routes (`/api/player/sync/stats`, `/api/player/sync/state`, `/api/player/auth/transfer/email`) return `404`.
  - `pushLocalDataAheadOfServer` pushes local-ahead puzzles via `syncProgress`.
- [ ] **Unit / PWA & Static Modals (`tests/unit/pwa-config.test.ts`):**
  - `installChunkLoadErrorHandler` prevents default on `vite:preloadError` and performs a single guarded reload when online.
- [ ] **Visual & Mechanical Gate:**
  - `pnpm run screenshot settings sync` captures and verifies the new modal targets cleanly.
  - `pnpm run check:agent` passes 100%.
