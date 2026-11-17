# Spec 31: True Offline PWA Play, Zoom Accessibility & Cloud Status Polish

Status: approved
Branch: spec/31-offline-pwa-zoom-accessibility-and-cloud-status

## 1. Objective

Deliver on the PWA offline promise and mobile accessibility standards: persist the active `PuzzleResponse` in `localStorage` so reopening the app offline immediately loads the puzzle without network errors; enable pinch-to-zoom in `index.html` while guaranteeing zero accidental double-tap zoom (`touch-action: manipulation` on `html, body`) and zero iOS input auto-zoom (`16px` mobile inputs); make the cloud sync indicator in `SettingsModal` reflect real authentication and connectivity state; and clean up Workbox PWA configuration in `pwa.config.ts`.

## 2. Invariants & Non-Goals

### Invariants
1. **True Offline Reopen for Loaded Puzzles:**
   - Whenever `usePuzzleQuery` fetches a puzzle (daily or archive date), the `PuzzleResponse` is cached in `localStorage` (keyed by `'today'` / `puzzle.date` / slot, bounded to the most recent puzzles so storage never bloats).
   - If the player reopens Sanakenno while offline (or when `GET /api/puzzle` fails) and a cached `PuzzleResponse` exists for the requested target (`viewingPuzzleDate ?? getHelsinkiDateString()`), `usePuzzleQuery` (or `useGameStore`) hydrates immediately from the cached puzzle instead of showing `"Lataus epäonnistui."`.
2. **Pinch-to-Zoom Enabled, Accidental Zoom 100% Disabled:**
   - `packages/web/index.html` viewport meta tag must **not** include `maximum-scale=1.0` or `user-scalable=no` (`content="width=device-width, initial-scale=1.0, viewport-fit=cover"`).
   - `packages/web/src/styles/tokens.css` must apply `touch-action: manipulation` on `html, body` (while `Honeycomb.tsx` retains `touch-action: none` on the SVG element), guaranteeing rapid double-taps anywhere in the UI never trigger browser zoom.
   - All text `<input>` elements in public modals (`SyncModal.tsx`) must have a computed mobile font size of `16px` (`text-base sm:text-xs` / `text-base sm:text-sm`) so iOS Safari never auto-zooms the viewport on input focus.
3. **Honest Cloud Sync Status in `SettingsModal`:**
   - `SettingsModal.tsx` must not hardcode `"Pilvitallennus aktiivinen"` when the client is offline (`navigator.onLine === false`) or when `useAuthStore.isLoggedIn` is `false`.
   - When online and authenticated (`isLoggedIn && isOnline`), show the green dot + `"Pilvitallennus aktiivinen"`. When offline or not yet initialized, show an amber/neutral status dot + `"Tallennettu tälle laitteelle (ei yhteyttä)"` so the player knows their progress is safe locally and will sync when online.
4. **Clean Workbox & Dev Server PWA Config (`pwa.config.ts`):**
   - Set `devOptions: { enabled: false }` so local Vite development is never polluted by a service worker.
   - Fix the `/api/` `NetworkOnly` runtime caching matcher in `pwa.config.ts` to `{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }`.

### Non-Goals
- Pre-downloading the entire Kotus dictionary or future unplayed puzzles to the client.
- Changing any server endpoints.

## 3. Contract & Architecture

### A. Offline Puzzle Cache (`packages/web/src/features/gameplay/storage.ts` & `usePuzzleQuery.ts`)
- In `storage.ts`:
  - Add `saveCachedPuzzleResponse(dateKey: string, puzzle: PuzzleResponse): void` and `loadCachedPuzzleResponse(dateKey: string): PuzzleResponse | null` under key `sanakenno_puzzle_cache_v1` (retaining up to 7 recent date entries in a small JSON map).
- In `usePuzzleQuery.ts`:
  - Determine `targetDate = date ?? getHelsinkiDateString()`.
  - On successful fetch from `apiClient.api.puzzle.$get`, persist `saveCachedPuzzleResponse(targetDate, data)`.
  - If the network fetch throws (e.g., offline), check `loadCachedPuzzleResponse(targetDate)`; if found, return the cached `PuzzleResponse` so `useGameStore.loadPuzzle(data)` and `loadState()` restore the player's exact in-progress game seamlessly.

### B. Viewport, Touch-Action & Input Font-Size (`index.html`, `tokens.css`, `SyncModal.tsx`)
- In `packages/web/index.html`:
  - Change viewport meta content to `"width=device-width, initial-scale=1.0, viewport-fit=cover"`.
- In `packages/web/src/styles/tokens.css`:
  - Add `touch-action: manipulation;` to both `html` and `body`.
- In `packages/web/src/features/player-sync/SyncModal.tsx`:
  - Update the pairing code `<input type="text">` and email `<input type="email">` classes to use `text-base sm:text-xs` and `text-base sm:text-sm` respectively so mobile font-size is `16px`.

### C. Honest Cloud Sync Indicator (`packages/web/src/features/modals/SettingsModal.tsx`)
- Track `isOnline` via `navigator.onLine` and `window` `'online'` / `'offline'` events, and read `isLoggedIn = useAuthStore((s) => s.isLoggedIn)`.
- Render `"Pilvitallennus aktiivinen"` (emerald indicator) when `isLoggedIn && isOnline`, and `"Tallennettu tälle laitteelle (ei yhteyttä)"` (amber/muted indicator) when offline or unauthenticated.

### D. PWA Config (`packages/web/src/pwa.config.ts`)
- Set `devOptions: { enabled: false }`.
- Use `{ urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }`.

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Unit / Offline Puzzle Cache (`tests/unit/offline-puzzle.test.tsx`):**
  - Fetching a puzzle caches its `PuzzleResponse` by Helsinki date; subsequent `usePuzzleQuery` execution while offline (when `/api/puzzle` rejects) resolves the cached puzzle and restores saved `foundWords` and `score` without rendering `"Lataus epäonnistui."`.
- [ ] **Unit / Accessibility & Zoom Prevention (`tests/unit/accessibility-zoom.test.tsx`):**
  - `packages/web/index.html` viewport meta tag allows user scaling (no `user-scalable=no` or `maximum-scale=1.0`).
  - `tokens.css` sets `touch-action: manipulation` on `html` and `body`.
  - `SyncModal` inputs include `text-base` so mobile font size is `16px`.
- [ ] **Unit / Cloud Status (`tests/unit/Modals.test.tsx`):**
  - `SettingsModal` shows `"Pilvitallennus aktiivinen"` when online + logged in, and `"Tallennettu tälle laitteelle (ei yhteyttä)"` when offline or unauthenticated.
- [ ] **Visual & Mechanical Gate:**
  - `pnpm run screenshot` inspected for mobile (`390px`) and desktop (`1280px`) to confirm `SyncModal` and `SettingsModal` layouts remain crisp.
  - `pnpm run check:agent` passes 100%.
