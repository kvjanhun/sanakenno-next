# Spec 07: Admin Suggestions, Combinations & Rejections

Status: shipped
Branch: spec/07-admin-suggestions-and-combinations
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/server/puzzle-suggestions.ts`
- `/Users/erezac/Projects/sanakenno/server/assets/pangram-quality.json`
- `/Users/erezac/Projects/sanakenno/server/routes/admin.ts`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/CombinationsBrowser.tsx`
- `/Users/erezac/Projects/sanakenno/packages/web/src/components/admin/SuggestionRejections.tsx`

## 1. Objective

Port the no-spoiler puzzle suggestion engine, curated `pangram-quality.json` asset, pre-computed 7-letter combinations browser, and permanent suggestion rejection workflow into `<500`-line modules across server and web.

## 2. Invariants & Non-Goals

- **No-Spoiler Suggestion Contract:** `GET /api/admin/suggestion` may score candidate word pools internally (to penalize short-word overlap with adjacent slots and match target word-count/pangram bands), but never exposes solution words unless `includePangrams=true` is explicitly requested for pangram strings.
- **500-Line Ceiling:** Split 1.0's 741-line `puzzle-suggestions.ts` into pure scoring/band logic and Kysely query/route modules.
- **Non-Goal:** Do not port the archived one-off OpenAI batch review CLI scripts (`scripts/pangram-review.ts`); copy the curated `pangram-quality.json` asset directly.

## 3. Contract & Architecture

- **`@sanakenno/server/src/features/admin-suggestions/`:**
  - `assets/pangram-quality.json`: Curated pangram quality grades (`good`, `ok`, `risky`, `reject`).
  - `suggestion-scorer.ts`: Pure candidate evaluation, target word-band sequence (`short`, `regular`, `open`, `long`), neighbor letter/short-word overlap scoring, and quality grade resolution.
  - `admin-suggestions.queries.ts`: Kysely queries for `combinations` (filtering, sorting, pagination, `in_rotation` status) and `suggestion_rejections` (`UNIQUE(letters_key, center)`).
  - `admin-suggestions.routes.ts`: `GET /api/admin/combinations`, `GET /api/admin/suggestion`, `GET /api/admin/suggestion-rejections`, `POST /api/admin/suggestion-rejections`, `DELETE /api/admin/suggestion-rejections/:id`.
- **`@sanakenno/web/src/features/admin/`:**
  - `CombinationsBrowser.tsx` and `SuggestionRejections.tsx` wired into `AdminLayout.tsx` via `apiClient`.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit tests in `tests/unit/suggestion-scorer.test.ts` verify word-band target progression, neighbor overlap penalties, and `pangram-quality.json` grade filtering (`reject` excluded).
- [x] Integration tests in `tests/integration/admin-suggestions.test.ts` verify `/api/admin/combinations` filtering/sorting, `/api/admin/suggestion` no-spoiler response, and rejecting/restoring suggestions via `/api/admin/suggestion-rejections`.
- [x] `pnpm run check:agent` passes with every file under 500 lines.
