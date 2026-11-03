# Spec 06: Admin Auth, Puzzle Editor, Schedule & Blocked Words

Status: shipped
Branch: spec/06-admin-auth-and-puzzle-editor
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/server/auth/`
- `/Users/erezac/Projects/sanakenno/server/routes/admin.ts`
- `/Users/erezac/Projects/sanakenno/scripts/archive/create-admin.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/AdminLayout.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/LoginPage.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/PuzzleEditor.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/BlockedWords.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/Schedule.tsx`

## 1. Objective

Implement admin cookie/CSRF authentication and the core puzzle management vertical slice (create/update/soft-delete/swap/center/preview puzzles, blocked words, and 14-day schedule), paired with the lazy-loaded `#/admin` web shell.

## 2. Invariants & Non-Goals

- **Security & CSRF:** All `/api/admin/*` routes require cookie session auth (`requireAuth`) and `X-CSRF-Token` verification (`requireCsrf`) on state-changing methods (`POST`, `PUT`, `DELETE`, `PATCH`), plus security headers and `admin_log` audit entries.
- **Duplicate Puzzle Protection & Slot Preservation:** Letters are compared as a sorted 7-letter key. Identical letters + center is refused (`409`); identical letters with a different center requires `force: true`. Deleting a puzzle sets `is_active = 0` (never deletes the row or renumbers slots) and invalidates the puzzle engine cache.
- **Code Splitting:** Load `AdminLayout` via `React.lazy` on `#/admin` so the player bundle stays lean.
- **Non-Goal:** Combinations/suggestions (`Spec 07`) and analytics/word-data (`Spec 08`) tabs render placeholder slots in `AdminLayout` until their respective specs run.

## 3. Contract & Architecture

- **`@sanakenno/server/src/features/admin-auth/`:**
  - `admin-auth.queries.ts`, `admin-auth.middleware.ts`, `admin-auth.routes.ts` (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `POST /api/auth/change-password` using `argon2`).
- **`@sanakenno/server/src/features/admin-puzzles/`:**
  - `admin-puzzles.queries.ts` & `admin-puzzles.routes.ts`: `POST /api/admin/puzzle`, `DELETE /api/admin/puzzle/:slot`, `POST /api/admin/puzzle/swap`, `POST /api/admin/puzzle/center`, `GET /api/admin/puzzle/slots`, `GET /api/admin/puzzle/variations`, `POST /api/admin/preview`, `GET/POST/DELETE /api/admin/block*`, `GET /api/admin/schedule`.
- **`@sanakenno/web/src/features/admin/`:**
  - `AdminLayout.tsx`, `LoginPage.tsx`, `PuzzleEditor.tsx`, `BlockedWords.tsx`, `Schedule.tsx`, `useAdminStore.ts`, plus CLI `scripts/create-admin.ts`.

## 4. Acceptance Criteria (Test Catalog)

- [x] Integration tests in `tests/integration/admin-puzzles.test.ts` verify admin login/logout/CSRF enforcement, duplicate letter-set rejection vs `force: true` override, soft-delete closing `display_number` gaps while preserving `slot`, slot swapping, word blocking cache invalidation, and 14-day schedule calculation.
- [x] Playwright E2E test verifies `#/admin` login, previewing and saving a puzzle, and viewing the schedule.
- [x] `pnpm run check:agent` passes with every file under 500 lines.
