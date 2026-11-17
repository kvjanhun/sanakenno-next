# Spec 30: True End-to-End Hono RPC & Zod Route Validation

Status: shipped
Branch: spec/30-end-to-end-hono-rpc-and-zod-validation

## 1. Objective

Fulfill the architectural mandate in `AGENTS.md` across the entire API surface: validate incoming request payloads in `packages/server/src/features/**/*.routes.ts` using `@hono/zod-validator` (or shared Zod schemas from `@sanakenno/shared`), replace the 26 raw `fetch('/api/...')` calls in `packages/web/src/api/client.ts` and `admin-client.ts` with the typed `apiClient` (`hc<AppType>`), and enforce this boundary mechanically in `tests/architecture.test.ts`.

## 2. Invariants & Non-Goals

### Invariants
1. **Zero Raw `fetch()` in `@sanakenno/web`:**
   - Every API call in `packages/web/src/api/client.ts` and `packages/web/src/api/admin-client.ts` must go through `apiClient` (`hc<AppType>('/')`)—with the sole optional exception of passing custom `fetch` options (such as `keepalive: true` on `apiClient.api.player.sync.progress.$post`) via Hono client's request init options.
   - `tests/architecture.test.ts` must forbid direct `fetch(` calls across **all** of `packages/web/src/` (including `src/api/`).
2. **Shared Zod Schema Validation in `*.routes.ts`:**
   - Every `POST` route in `packages/server/src/features/**/*.routes.ts` that accepts a JSON body must validate it using `@hono/zod-validator` (with a custom hook returning the expected `400` Finnish/English error message shape so existing integration tests remain 100% green) or `Schema.safeParse()` backed by `@sanakenno/shared` schemas.
3. **100% Backward-Compatible HTTP Statuses & Error Messages:**
   - All existing status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `429`) and Finnish/English error strings tested in `tests/integration/*.test.ts` must remain intact.

### Non-Goals
- Changing any public or admin endpoint URL paths or HTTP methods.
- Altering database queries in `*.queries.ts`.

## 3. Contract & Architecture

### A. Shared Schemas (`@sanakenno/shared`)
- Audit and complete any missing request/query schemas in `packages/shared/src/schemas/admin.ts`, `player-sync.ts`, and `puzzle.ts` so every Hono route has an exact Zod schema in `@sanakenno/shared`.

### B. Server Route Validators (`@sanakenno/server`)
- Create a small reusable Hono Zod validator wrapper (e.g., `packages/server/src/lib/zod-validator.ts` or per-route hook) using `@hono/zod-validator` (`zValidator('json', Schema, (result, c) => ...)` and `zValidator('query', Schema, ...)`).
- Wire `zValidator` into:
  - `player-auth.routes.ts` (`/auth/transfer/create`, `/auth/transfer/email`, `/auth/transfer/use`)
  - `player-sync.routes.ts` (`/stats`, `/state`, `/progress`, `/preferences`)
  - `telemetry.routes.ts` (`/achievement`, `/failed-guess`, `/word-find`)
  - `admin-auth.routes.ts` (`/login`, `/change-password`)
  - `admin-puzzles.routes.ts` (`/puzzle`, `/puzzle/swap`, `/puzzle/center`, `/preview`, `/block`)
  - `admin-suggestions.routes.ts` (`/suggestion-rejections`)
- Ensure `AppType` exported from `packages/server/src/app.ts` infers all route parameters, query parameters, and JSON request/response types.

### C. Typed Hono RPC Client (`packages/web/src/api/client.ts` & `admin-client.ts`)
- Refactor all 10 raw `fetch()` wrappers in `packages/web/src/api/client.ts` to call `apiClient.api.*` methods (passing `{ init: { keepalive: true } }` for `postSyncProgress`).
- Refactor all 16 raw `fetch()` wrappers in `packages/web/src/api/admin-client.ts` to call `apiClient.api.admin.*` methods with `{ headers: csrfHeaders(csrfToken) }`.

### D. Mechanical Enforcement (`tests/architecture.test.ts`)
- Update `forbids direct fetch() calls in @sanakenno/web` in `tests/architecture.test.ts` to scan **all** files in `packages/web/src` (removing the `if (rel.startsWith('packages/web/src/api/')) continue;` exemption).
- Add a check in `tests/architecture.test.ts` verifying that `@hono/zod-validator` is actively used across server route slices.

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Architecture Fitness (`tests/architecture.test.ts`):**
  - Zero occurrences of `fetch(` in `packages/web/src/` (including `client.ts` and `admin-client.ts`).
  - Server route modules use `@hono/zod-validator` and shared schemas from `@sanakenno/shared`.
- [ ] **Integration (`tests/integration/*.test.ts`):**
  - All existing integration tests for puzzle, archive, player-auth, player-sync, telemetry, admin-auth, admin-puzzles, admin-suggestions, and admin-analytics pass with identical status codes and error messages.
- [ ] **Unit / Client (`tests/unit/`):**
  - Existing unit tests mocking or exercising `client.ts` and `admin-client.ts` pass 100% with full TypeScript compile-time checking (`pnpm run typecheck`).
- [ ] **Mechanical Gate:**
  - `pnpm run check:agent` passes 100%.
