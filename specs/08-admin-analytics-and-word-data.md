# Spec 08: Admin Analytics & Word Data Slice

Status: approved
Branch: spec/08-admin-analytics-and-word-data
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/server/routes/admin.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/Stats.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/WordData.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/WordFinds.tsx`

## 1. Objective

Port the admin telemetry & word-tuning analytics endpoints (`/api/admin/achievements`, `/api/admin/failed-guesses`, `/api/admin/word-finds`) using Kysely queries and wire the `Tilastot` (`Stats`) and `Sanadata` (`WordData` / `WordFinds`) tabs into the admin UI.

## 2. Invariants & Non-Goals

- **Unique-Player vs Raw-Event Modes:** `GET /api/admin/achievements` must support both unique-session (`session_id`) and raw-event daily rank breakdowns.
- **Word-Finds Tuning Modes:** `GET /api/admin/word-finds` joins active puzzle words with `word_finds` counts (including `0`-count words not yet found by any player) and supports both found-first and hardest-first sorting, plus one-click word blocking.
- **Non-Goal:** No changes to public telemetry ingestion routes (already shipped in Spec 05).

## 3. Contract & Architecture

- **`@sanakenno/shared`:**
  - Add Zod schemas for `AdminAchievementsResponseSchema`, `AdminFailedGuessesResponseSchema`, and `AdminWordFindsResponseSchema`.
- **`@sanakenno/server/src/features/admin-analytics/`:**
  - `admin-analytics.queries.ts`: Typed Kysely queries over `achievements`, `failed_guesses`, and `word_finds`.
  - `admin-analytics.routes.ts`: Chained Hono RPC routes for `GET /api/admin/achievements`, `GET /api/admin/failed-guesses`, and `GET /api/admin/word-finds`.
- **`@sanakenno/web/src/features/admin/`:**
  - `Stats.tsx`, `WordData.tsx`, and `WordFinds.tsx` mounted in `AdminLayout.tsx` using TanStack Query + `apiClient`.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Integration tests in `tests/integration/admin-analytics.test.ts` verify daily achievement aggregation (unique sessions vs raw events), failed-guess filtering by date/word, and per-puzzle word-find counts including zero-count unfound words.
- [ ] Component/E2E tests verify switching between `Tilastot` and `Sanadata` tabs in `#/admin` and sorting word finds by hardest-first.
- [ ] `pnpm run check:agent` passes with every file under 500 lines.
