# Spec 47: Admin Workspace Package Extraction (`@sanakenno/admin`) & Typed RPC Client Lean-Out

Status: shipped
Branch: spec/47-admin-workspace-package-and-rpc-client-cleanup

## 1. Objective

Move the ~3.8k-line admin UI (`packages/web/src/features/admin/` and `admin-client.ts`) into a dedicated `@sanakenno/admin` workspace package and introduce a small typed Hono RPC unwrap helper across both player and admin API clients—reducing `@sanakenno/web` to the player game alone and eliminating ~200 lines of repetitive fetch/JSON wrapper boilerplate.

## 2. Invariants & Non-Goals

### Invariants

- **Single Production Deployment & Lazy Route Parity:** `@sanakenno/web` continues to lazy-load the admin panel on `#/admin` via `lazy(() => import('@sanakenno/admin'))`, producing a single Vite build, single Docker image, and single Cloud Run service with zero change to the player bundle's initial JS size.
- **Zero Circular Workspace Dependencies:** Dependency graph stays strictly acyclic:
  - `@sanakenno/shared` → (no workspace deps)
  - `@sanakenno/server` → `@sanakenno/shared`
  - `@sanakenno/admin` → `@sanakenno/shared` (+ type-only `@sanakenno/server/app`)
  - `@sanakenno/web` → `@sanakenno/shared`, `@sanakenno/admin` (+ type-only `@sanakenno/server/app`)
- **Theme Toggle Decoupling:** `AdminLayout` accepts an optional `themeToggle?: ReactNode` prop from `App.tsx` (instead of importing `../theme/ThemeToggle.js` from `@sanakenno/web`) so `@sanakenno/admin` has zero runtime imports from `@sanakenno/web`.
- **Full Architectural Guardrails:** `tests/architecture.test.ts` enforces the exact same rules on `packages/admin/` (500-line ceiling, no direct `fetch()`, type-only `@sanakenno/server` imports, no hardcoded hex colors in `.tsx`).

### Non-Goals

- Changing admin UI layout, features, authentication, or backend routes.
- Deploying admin as a separate service or changing `#/admin` routing.

## 3. Contract & Architecture

### A. Workspace Package (`packages/admin/`)

- Create `packages/admin/package.json` (`@sanakenno/admin`) and `packages/admin/tsconfig.json`, mirroring `@sanakenno/shared` source-entry exports so Vite bundles and code-splits it directly without an extra build step (`"exports": { ".": "./src/index.ts" }`).
- Move all 19 files from `packages/web/src/features/admin/*` into `packages/admin/src/` and move `packages/web/src/api/admin-client.ts` into `packages/admin/src/api/admin-client.ts`.
- Export `AdminLayout` (default and named) plus public test entry points (`useAdminStore`, sub-views as needed) from `packages/admin/src/index.ts`.
- Update `packages/web/src/App.tsx` to lazy-load `@sanakenno/admin` and pass `<ThemeToggle />` into `<AdminLayout themeToggle={<ThemeToggle />} />`.
- Update root `tsconfig.json` / `vitest.config.ts` / `eslint.config.js` / `Dockerfile` (copy `packages/admin/package.json` in `build` stage; not needed in `runtime` stage since Vite bundles it into `packages/web/dist`).

### B. Typed RPC Client Lean-Out (`@sanakenno/web` & `@sanakenno/admin`)

- Replace repeated `if (!res.ok) throw new Error(await readErrorMessage(res, fallback)); return (await res.json()) as T;` blocks in `packages/web/src/api/client.ts` and `packages/admin/src/api/admin-client.ts` with a small typed `unwrapJson<T>(res, fallback)` / `unwrapOptionalJson<T>(res)` helper (relying on `hc<AppType>` response types where exact, keeping Finnish fallback error messages and `requires_force` error metadata intact).
- Remove `export * from './admin-client.js'` from `packages/web/src/api/client.ts` so player code and admin code keep clean API boundaries.

### C. Architecture Fitness & Docs

- Update `tests/architecture.test.ts` to scan both `packages/web/src` and `packages/admin/src` for raw `fetch()`, value imports from `@sanakenno/server`, and hardcoded hex colors.
- Update `PROJECT_MAP.md` and `README.md` workspace tables to document `@sanakenno/admin`.

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Architecture (`tests/architecture.test.ts`):**
  - Verifies `packages/admin/src` obeys all frontend guardrails (no `fetch()`, no hex colors, type-only `@sanakenno/server` imports, <=500 lines) and has zero imports from `@sanakenno/web`.
- [x] **Unit (`tests/unit/admin-components.test.tsx`, `tests/unit/admin-puzzle-editor.test.tsx`, `tests/unit/admin-store.test.ts`, `tests/unit/api-clients.test.ts`):**
  - Update import paths to `@sanakenno/admin` and verify `unwrapJson` preserves exact error messages, `requires_force` propagation on `adminSavePuzzle`, and `null` returns on 401/non-OK session checks.

### Visual & Mechanical Gate

- [x] **Visual Inspection (`pnpm run screenshot`):** Verify gameplay baseline and `#/admin` login/layout render identically at 390px and 1280px (including `ThemeToggle` in `AdminLayout`).
- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100%.
