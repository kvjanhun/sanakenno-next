# Spec 05: Player Auth, Cross-Device Sync & Telemetry

Status: shipped
Branch: spec/05-player-auth-sync-and-telemetry
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/server/player-auth/`
- `/Users/erezac/Projects/sanakenno/server/routes/player-sync.ts`
- `/Users/erezac/Projects/sanakenno/server/email/send-transfer-link.ts`
- `/Users/erezac/Projects/sanakenno/server/routes/achievement.ts`
- `/Users/erezac/Projects/sanakenno/server/routes/failed-guess.ts`
- `/Users/erezac/Projects/sanakenno/server/routes/word-find.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/store/useAuthStore.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/SyncModal.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/ConnectBanner.tsx`

## 1. Objective

Port passwordless player Bearer authentication, device-pairing transfer links (including Resend email delivery), conflict-free cross-device sync (`/api/player/sync*`), and public gameplay telemetry endpoints (`/api/achievement`, `/api/failed-guess`, `/api/word-find`).

## 2. Invariants & Non-Goals

- **1:1 Token & Merge Parity:** Player keys hash with SHA-256 (`player_key_hash`); Bearer sessions have a 90-day TTL in `player_sessions`; `mergeStatsRecord` and `mergePuzzleState` remain monotonic (never downgrade rank, score, found words, or longest word).
- **SQLite Writer Safety:** Sync writes run inside `runImmediateTransactionWithRetry` (`BEGIN IMMEDIATE`) so concurrent requests never lose updates under `SQLITE_BUSY`.
- **Non-Goal:** Admin cookie authentication is separate and scoped to Spec 06.

## 3. Contract & Architecture

- **`@sanakenno/shared`:**
  - Add Zod schemas for player auth init/transfer payloads, `SyncPayloadSchema`, `SyncProgressPayloadSchema`, and telemetry request bodies.
- **`@sanakenno/server/src/features/player-auth/` & `player-sync/` & `telemetry/`:**
  - `player-auth.queries.ts` & `player-auth.routes.ts`: `POST /api/player/auth/init`, `POST /api/player/auth/transfer/create`, `POST /api/player/auth/transfer/use`, `POST /api/player/auth/logout`, `GET /api/player/me`, `requirePlayerAuth` middleware, and `send-transfer-link.ts`.
  - `player-sync.queries.ts` & `player-sync.routes.ts`: `GET /api/player/sync`, `POST /api/player/sync/stats`, `POST /api/player/sync/state`, `POST /api/player/sync/progress`.
  - `telemetry.queries.ts` & `telemetry.routes.ts`: `POST /api/achievement`, `POST /api/failed-guess`, `POST /api/word-find`.
- **`@sanakenno/web/src/features/player-sync/`:**
  - `useAuthStore.ts` + TanStack Query sync hooks/mutations via `apiClient`, `SyncModal.tsx`, and `ConnectBanner.tsx`.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Integration tests in `tests/integration/player-sync.test.ts` verify player init, transfer token exchange, Bearer session expiry, monotonic stats/state merging on `POST /api/player/sync/*`, and only pushing local records absent or ahead of server on pull.
- [ ] Integration tests in `tests/integration/telemetry.test.ts` verify `achievement`, `failed-guess` (`UNIQUE(word, puzzle_date)` upsert), and `word-find` (`UNIQUE(word, puzzle_number)` upsert).
- [ ] `pnpm run check:agent` passes with zero warnings or boundary violations.
