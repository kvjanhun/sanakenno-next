# Spec 29: API Spoiler Lock, Rate-Limit & Sync Hardening

Status: approved
Branch: spec/29-api-spoiler-lock-rate-limit-and-sync-hardening

## 1. Objective

Close the public API spoiler and rate-limit vulnerabilities and repair silent client/server synchronization bugs: block future scheduled puzzle slots on `GET /api/puzzle/:number` and `GET /api/puzzle/:number/words`; harden rate limiters across admin login, player init, and telemetry; fix offline sync error propagation and modal-open flushes; wire up theme/palette preference cloud sync; ensure 6-digit PIN pairing never corrupts `playerKey`; and implement the missing `achievement_progress` announcements from Spec 27.

## 2. Invariants & Non-Goals

### Invariants
1. **Zero Future Puzzle Spoilers:**
   - A puzzle slot is playable or inspectable via `GET /api/puzzle/:number` only if it is today's active slot or a slot scheduled on a past date within the current active cycle (up to `todayActiveIndex`). Future scheduled slots (`activeIndex > todayActiveIndex`) must return `403 Forbidden`.
   - `GET /api/puzzle/:number/words` must return `403 Forbidden` for **both** today's active slot (`activeIndex === todayActiveIndex`) and any future scheduled slot (`activeIndex > todayActiveIndex`). Only past archive slots (`activeIndex < todayActiveIndex`) may reveal plaintext words.
2. **Rate-Limiter Integrity & CGNAT Safety:**
   - Admin login (`POST /api/auth/login`) must use `SlidingWindowRateLimiter` (5 attempts per 15 minutes per IP) and reset/prune cleanly rather than permanently locking out an IP in an unbounded `Map`.
   - `POST /api/player/auth/init` must be rate-limited by IP (e.g., 20 requests per 15 minutes) to prevent unauthenticated database row exhaustion while remaining generous for shared mobile CGNAT IPs.
   - Telemetry rate limiting (`getRateLimitKey` in `rate-limiter.ts`) must **only** bucket by Bearer token when the token is a valid active session in `player_sessions` (or must fall back to IP-based bucketing with a higher CGNAT-safe IP ceiling), preventing attackers from bypassing rate limits by sending random `Authorization: Bearer <uuid>` headers.
3. **Sync Queue Durability & Preference Sync:**
   - `postSyncProgress` in `packages/web/src/api/client.ts` must throw on network failure or non-2xx HTTP status so `useAuthStore.flushPendingSync()` retains failed payloads in `pendingSyncQueue` for retry when connectivity returns.
   - Opening `SyncModal` or `StatsModal` must trigger `void useAuthStore.getState().flushPendingSync()`.
   - Changing `themeId` (`usePaletteStore`) or `preference` (`useThemePreferenceStore`) must update `PREFERENCES_UPDATED_AT_KEY` (`new Date().toISOString()`) in `localStorage` and trigger `useAuthStore.getState().syncPreferences()` via `registerPreferenceSyncCallback`.
   - Redeeming a 6-digit PIN or single-use transfer ticket in `useAuthStore.useTransfer(token)` must **not** overwrite `PLAYER_KEY_STORAGE_KEY` (`playerKey`) with the consumed PIN/ticket unless the token is a 64-hex `player_key`, and `POST /api/player/auth/transfer/create` (`/email`) must rely on the authenticated `requirePlayerAuth` session without rejecting devices paired via PIN.

### Non-Goals
- Changing the database schema (`schema.ts` / `baseline-sql.ts`).
- Changing puzzle rotation math for past or current dates.

## 3. Contract & Architecture

### A. Server Puzzle Spoiler Guard (`packages/server/src/features/puzzle/puzzle.queries.ts` & `puzzle.routes.ts`)
- Add helper `getSlotScheduleRelation(db, slot, todayHelsinki): Promise<'past' | 'today' | 'future' | 'inactive'>` in `puzzle.queries.ts`:
  - Uses the active cycle order relative to `epoch_date` and `todayHelsinki`:
    - If `slot` is not in `activeSlots`, return `'inactive'`.
    - If `slot === todaySlot`, return `'today'`.
    - If `slot` has appeared on at least one date `d` with `epochDate <= d < todayHelsinki`, return `'past'`.
    - Otherwise return `'future'`.
- In `puzzle.routes.ts`:
  - `GET /api/puzzle/:number`: If relation is `'future'`, return `c.json({ error: 'Future puzzles are not available' }, 403)`.
  - `GET /api/puzzle/:number/words`: If relation is `'today'` or `'future'`, return `c.json({ error: "Word list not available for today's or future puzzles" }, 403)`.

### B. Server Rate-Limiter & Sync Validation (`packages/server/src/features/admin-auth/`, `player-auth/`, `telemetry/`, `player-sync/`)
- **Admin Auth (`admin-auth.routes.ts`):** Replace `loginRateLimitMap` with `SlidingWindowRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 })`.
- **Player Auth (`player-auth.middleware.ts`, `player-auth.routes.ts`):**
  - Add `initPlayerRateLimit` middleware using `SlidingWindowRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20 })` on `POST /api/player/auth/init`.
  - In `handleTransferEmail` (`player-auth.routes.ts`), since the route is already protected by `requirePlayerAuth(db)`, only validate `body['player_key']` if it is a 64-char hex string, or ignore stale/PIN values so PIN-paired devices can send transfer emails.
- **Telemetry Rate Limiter (`rate-limiter.ts`, `telemetry.routes.ts`):**
  - Update `createRateLimiterMiddleware` in `telemetry.routes.ts` to validate any Bearer token via `validatePlayerToken(db, token)` before using `token:<hash>` as the rate-limit key; if missing or invalid, key by `ip:<clientIp>`.
- **Player Sync Validation (`player-sync.queries.ts`):**
  - In `mergeAndStorePuzzleState`, when the puzzle exists via `getFullPuzzleBySlot(db, incoming.puzzle_number)`, filter `incoming.found_words` to words present in `puzzle.words` and recompute `score` via `recalcScore(validWords, allLetters)` so corrupted or tampered client payloads cannot inflate server scores.

### C. Web Sync, Preferences & Achievement Progress (`packages/web/src/api/client.ts`, `useAuthStore.ts`, `usePaletteStore.ts`, `useThemePreferenceStore.ts`, `gameplay-effects.ts`, `announcements.ts`)
- **`client.ts`:** In `postSyncProgress`, remove `.catch(() => undefined)` and throw an `Error` when `!res.ok`.
- **`useAuthStore.ts`:**
  - Register `registerPreferenceSyncCallback(() => { void useAuthStore.getState().syncPreferences(); })`.
  - In `useTransfer(token)`, only store `token` in `PLAYER_KEY_STORAGE_KEY` if `/^[0-9a-f]{64}$/i.test(token)`; otherwise clear `PLAYER_KEY_STORAGE_KEY` (`playerKey: null`) so consumed 6-digit PINs are never persisted as the permanent key.
- **`usePaletteStore.ts` & `useThemePreferenceStore.ts`:**
  - Write `saveToStorage('sanakenno_preferences_updated_at', new Date().toISOString())` inside `setThemeId` and `setPreference` before calling `notifyPreferenceChanged()`.
- **`SyncModal.tsx` & `StatsModal.tsx`:**
  - Call `void useAuthStore.getState().flushPendingSync()` when `show` transitions to `true`.
- **`announcements.ts` & `gameplay-effects.ts`:**
  - Add `'achievement_progress'` to `AnnouncementCategory` and `AchievementAnnouncement` (with `isUnlock?: boolean`) and emit progress announcements in `handleAcceptedWordEffects` when daily streak advances (`newStreak.current > prevStreak.current` without unlocking a tier) or when `pangrams`, `full_board`, or `unassisted_master` reaches `nextTierTarget - 1`, matching Spec 27 §3.2. Also support `'progress'` in `triggerConsoleAnnouncement`.

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Integration (`tests/integration/puzzle-rpc.test.ts`):**
  - `GET /api/puzzle/:number` returns `200` for today's and past slots, and `403` for future scheduled slots.
  - `GET /api/puzzle/:number/words` returns `200` for past slots, and `403` for both today's slot and future scheduled slots.
- [ ] **Integration (`tests/integration/telemetry.test.ts`, `admin-auth.test.ts`, `player-sync.test.ts`):**
  - Sending random invalid `Authorization: Bearer <uuid>` headers on `/api/word-find` does not bypass IP rate limiting.
  - Admin login rate limit resets after the sliding window expires.
  - `POST /api/player/auth/init` enforces its sliding-window rate limit.
  - Device B paired via 6-digit PIN can subsequently request a transfer email (`POST /api/player/auth/transfer/create`) with `200 OK`.
  - `POST /api/player/sync/progress` strips non-puzzle words and recalculates accurate score on the server.
- [ ] **Unit / UI (`tests/unit/`):**
  - When `postSyncProgress` fails (network rejection or `500`), `flushPendingSync()` keeps the payload in `pendingSyncQueue` and retries on the next flush.
  - Changing palette (`setThemeId`) or theme (`setPreference`) updates `sanakenno_preferences_updated_at` and triggers `syncPreferences()`.
  - Reaching `nextTierTarget - 1` or extending a daily streak enqueues an `achievement_progress` announcement in `gameplay-effects.ts`.
- [ ] **Mechanical Gate & Visual Verification:**
  - `pnpm run check:agent` and `pnpm run screenshot` pass 100%.
