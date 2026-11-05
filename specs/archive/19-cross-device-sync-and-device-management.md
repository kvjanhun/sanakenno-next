# Spec 19: Cross-Device Sync Status and Device Management

Status: shipped
Branch: spec/19-cross-device-sync-and-device-management

## 1. Objective

Refine the cross-device synchronization UX and state indicators: merge redundant sync buttons in Settings into a single entry point, distinguish continuous cloud backup from multi-device pairing status via server-reported active session count, separate copy feedback states for pairing code vs link, clarify destructive device actions ("Katkaise muut laitteet ja vaihda koodi" vs "Irrota tämä laite tilistä"), and provide a safe unlinking flow with an option to keep or reset local progress.

## 2. Invariants & Non-Goals

- **Cloud Save vs Cross-Device Linking Invariant:** Every player gets continuous anonymous cloud save from day 1 (`isLoggedIn` is true). Cloud backup active indicator must be distinguished from cross-device pairing (multi-device active sessions > 1).
- **Session Security Invariant:** Rotating the pairing code invalidates all other active sessions while keeping the current device logged in with its progress. Unlinking a device terminates only the current device's session on the server.
- **Architectural Rules:** Keep vertical slice cohesion; no raw SQL in route files; files <500 lines; pass `pnpm run check:agent`.
- **Non-Goals:** Building a full account/password system or third-party OAuth; changing the underlying 64-char hex pairing code format or email transfer token mechanics.

## 3. Contract & Architecture

### Shared Schemas (`@sanakenno/shared`)
- In `PlayerMeResponseSchema` (or `packages/shared/src/schemas/player-sync.ts`), add `session_count: z.number().int().nonnegative()`.

### Kysely Queries (`@sanakenno/server`)
- In `packages/server/src/features/player-auth/player-auth.queries.ts`, add helper `countActivePlayerSessions(db, playerId)` counting rows in `player_sessions` where `player_id = playerId` and `expires_at > datetime('now')`.

### Hono RPC Routes (`@sanakenno/server`)
- Update `GET /api/player/me` to return `{ player_id: player.playerId, session_count: number }`.

### Web Frontend (`@sanakenno/web`)
- **`useAuthStore.ts`:**
  - Track `sessionCount: number` (defaulting to 1).
  - Update `sessionCount` on `/me` fetch and after `useTransfer` / `rotatePlayerKey`.
  - Update `logout({ clearLocalProgress }: { clearLocalProgress: boolean })`:
    - Terminate server session and clear auth tokens.
    - If `clearLocalProgress` is true, clear local stats and puzzle state storage.
    - If false, retain local stats and puzzle state and call `initPlayer()` to bind them to a fresh server player identity.
- **`GameplayView.tsx`:**
  - Pass sync properties (`isLinked`, `sessionCount`, `isLoggedIn`) to `SettingsModal`.
- **`SettingsModal.tsx`:**
  - Replace the dual buttons ("Synkronoi tämä laite" and "Yhdistä olemassa olevaan tiliin") with a single primary button: **"Hallitse synkronointia"**.
  - Present a 2-part status indicator:
    - **Pilvitallennus:** Green status dot with "Pilvitallennus aktiivinen" (edistymisesi tallennetaan jatkuvasti).
    - **Laitteet:** "Käytössä vain tällä laitteella" (kun `sessionCount <= 1`) tai "Synkronoitu (N laitetta)" (kun `sessionCount > 1`).
- **`SyncModal.tsx`:**
  - Independent copy feedback: `copiedTarget: 'code' | 'link' | null`. Clicking "Kopioi linkki" displays "Linkki kopioitu!" on the link button without altering the "Kopioi koodi" button.
  - Action labels:
    - "Katkaise muut laitteet ja vaihda koodi" (opens `confirmRotate` view).
    - "Irrota tämä laite tilistä" (opens `confirmUnlink` view).
  - `confirmUnlink` view presents two distinct choices:
    1. "Säilytä edistyminen uudella tilillä" (`logout({ clearLocalProgress: false })`).
    2. "Tyhjennä laite ja aloita alusta" (`logout({ clearLocalProgress: true })`).

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Server Integration (`tests/integration/player-sync.test.ts`):** `GET /api/player/me` returns `player_id` and correct `session_count` across multiple created sessions.
- [ ] **SyncModal Copy Feedback (`tests/unit/player-sync-components.test.tsx`):** Clicking "Kopioi linkki" changes only the link button text to "Linkki kopioitu!" and leaves "Kopioi koodi" intact.
- [ ] **Unlink / Disconnect Flow (`tests/unit/player-sync-components.test.tsx`):** "Irrota tämä laite tilistä" presents choices to keep or clear progress, invoking `logout` with the expected flag.
- [ ] **Settings Modal UI (`tests/unit/modals-theme-rollover.test.tsx`):** Settings renders single "Hallitse synkronointia" button and displays cloud status + device count.
- [ ] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
- [ ] **Visual Verification:** Capture and inspect screenshots (`pnpm run screenshot`) for SettingsModal and SyncModal.
