# Spec 25: Device Session Deduplication & Accurate Device Counting

Status: shipped
Branch: spec/25-device-session-deduplication

## 1. Objective

Eliminate phantom device sessions and inconsistent device counts between browsers (e.g. iOS Safari) and installed PWAs by:
- Deduplicating sessions during pairing (`/auth/transfer/use`) by invalidating the caller's previous session token instead of accumulating orphan rows in `player_sessions`.
- Returning the authoritative server `session_count` in `TransferUseResponse` instead of hardcoding `sessionCount: 2` on the client.
- Refreshing `sessionCount` via `GET /api/player/me` whenever `SettingsModal` or `SyncModal` is opened.
- Removing `Math.max(sessionCount, 2)` in `SettingsModal` so the device count strictly reflects reality and agrees with `SyncModal`.
- Fixing `initPlayer()` so it does not trigger an orphan secondary session upon initial launch with local data.

## 2. Invariants & Non-Goals

- **Session Deduplication Invariant:** A device connecting or re-pairing must replace its existing active session on the server. Repeatedly opening transfer links or re-entering pairing codes on the same device must never increase the total active device count.
- **Server Authority Invariant:** The server is the single source of truth for active device/session count. The client must never assume or hardcode `sessionCount = 2`.
- **UI Consistency Invariant:** `SettingsModal` and `SyncModal` must report identical device counts and cleanly show "Käytössä vain tällä laitteella" when `sessionCount <= 1` and "Synkronoitu (N laitetta)" when `sessionCount > 1`.
- **Backward Compatibility:** `POST /api/player/auth/transfer/use` must remain backward compatible: if no `Authorization` header is provided by legacy clients, it creates a session normally without error.
- **Non-Goals:** Introducing hardware fingerprinting or external device tracking cookies; altering the 64-character hex pairing token format.

## 3. Contract & Architecture

### Shared Schemas (`@sanakenno/shared`)
- In `packages/shared/src/schemas/player-sync.ts`:
  - Extend `TransferUseResponseSchema` with `session_count: z.number().int().positive()`.

### Server Routes & Logic (`@sanakenno/server`)
- In `packages/server/src/features/player-auth/player-auth.routes.ts`:
  - In `POST /auth/transfer/use`:
    - Read optional `Authorization: Bearer <token>` header.
    - Inside writer transaction `runImmediateTransactionWithRetry`:
      - If existing token is provided, `deletePlayerSession(trx, existingToken)`.
      - Mint new session: `createPlayerSession(trx, playerId)`.
      - Count active sessions: `countActivePlayerSessions(trx, playerId)`.
    - Return `session_count` in response JSON (status 200).

### Web Frontend (`@sanakenno/web`)
- In `packages/web/src/api/client.ts`:
  - Update `postPlayerTransferUse(payload, currentToken?)` to include `Authorization: Bearer <currentToken>` if provided.
- In `packages/web/src/features/player-sync/useAuthStore.ts`:
  - `useTransfer(token)`:
    - If `get().playerKey === token`, bypass re-linking and simply refresh session count.
    - Pass existing `AUTH_TOKEN_STORAGE_KEY` to `postPlayerTransferUse`.
    - Set `sessionCount: res.session_count` from the server response (dropping hardcoded `sessionCount: 2`).
  - `initPlayer()`:
    - Pass the newly minted token to `postPlayerTransferUse` (or upload local data without creating a duplicate session), and update `AUTH_TOKEN_STORAGE_KEY` with the returned token.
  - Add `refreshSessionCount: () => Promise<void>` that calls `fetchPlayerMe` and updates store `sessionCount` and `isLinked`.
- In `packages/web/src/features/modals/SettingsModal.tsx`:
  - Refresh session count on mount/open.
  - Display `sessionCount > 1 ? \`Synkronoitu (${sessionCount} laitetta)\` : 'Käytössä vain tällä laitteella'`.
- In `packages/web/src/features/player-sync/SyncModal.tsx`:
  - Refresh session count on mount/open.

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Transfer Endpoint Session Deduplication:** Calling `POST /api/player/auth/transfer/use` with an existing `Authorization: Bearer <token>` deletes the old session and returns `session_count` reflecting deduplicated count.
- [ ] **Repeated Transfers Do Not Accumulate Sessions:** Re-running `/auth/transfer/use` multiple times with the returned session token keeps `session_count` constant at 1 (or existing devices + 1).
- [ ] **Accurate Client Store Updates:** `useTransfer` updates `sessionCount` to the server-returned count instead of defaulting to 2.
- [ ] **UI Sync:** `SettingsModal` and `SyncModal` display the exact server session count without artificial `Math.max(sessionCount, 2)`.
- [ ] **Fresh Data on Modal Open:** Opening settings or sync triggers a session count refresh.
- [ ] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
- [ ] **Visual Verification:** Visual screenshots verified for desktop and mobile.
