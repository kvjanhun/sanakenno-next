# Spec 02: Daily Puzzle, Wordlist Engine & Archive RPC

Status: shipped
Branch: spec/02-daily-puzzle-and-archive-rpc
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/server/puzzle-engine.ts`
- `/Users/erezac/Projects/sanakenno/server/routes/puzzle.ts`
- `/Users/erezac/Projects/sanakenno/server/routes/archive.ts`
- `/Users/erezac/Projects/sanakenno/server/index.ts`

## 1. Objective

Implement the server-side Finnish wordlist & puzzle rotation engine and expose typed Hono RPC routes for daily/slot puzzles (`GET /api/puzzle`, `GET /api/puzzle/:number`, `GET /api/puzzle/:number/words`), the puzzle archive (`GET /api/archive`), and rotation headroom on `GET /api/health`.

## 2. Invariants & Non-Goals

- **`slot` vs `display_number` Separation:** `slot` (`puzzle_number` in API payloads) is the permanent storage key; `display_number` is the 1-based index within active (`is_active = 1`) slots (`getActiveSlots()`). Cycle positions and `days_remaining` must never use slot arithmetic.
- **Anti-Spoiler Protection:** `GET /api/puzzle/:number/words` must reject (`403`) requests for today's active puzzle slot and return `404` for inactive or out-of-range slots.
- **500-Line Ceiling:** Decompose 1.0's 542-line `puzzle-engine.ts` into focused modules under 500 lines each.
- **Non-Goal:** Do not implement admin puzzle mutation routes or React UI components in this spec.

## 3. Contract & Architecture

- **`@sanakenno/shared`:**
  - Add Zod schemas & types for `PuzzleResponseSchema`, `PuzzleWordsResponseSchema`, `ArchiveEntrySchema`, `ArchiveResponseSchema`, and add `days_remaining: z.number().int()` to `HealthResponseSchema`.
- **`@sanakenno/server/src/features/puzzle/`:**
  - `wordlist.ts`: Load & normalize `kotus_words.txt` (lowercase, strip hyphens), compute valid puzzle words, SHA-256 `word_hashes`, `max_score`, `hint_data`, center variations, and per-slot memory cache with generation invalidation.
  - `puzzle.queries.ts`: Kysely queries for active slots (`is_active = 1`), puzzle lookup by slot, `blocked_words`, `config` (`epoch_date`), `nextFreeSlot()`, and `getDaysRemainingInCycle(helsinkiDate)`.
  - `puzzle.routes.ts`: Chained Hono RPC routes for `GET /` (today's puzzle or `?date=YYYY-MM-DD`), `GET /:number`, and `GET /:number/words`.
  - `archive.routes.ts`: Chained Hono RPC route for `GET /` (last 7 days or `?all=true` for current active-puzzle cycle).
- **`@sanakenno/server/src/features/health/`:**
  - Include `days_remaining` in `GET /api/health`.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit tests in `tests/unit/wordlist.test.ts` verify Finnish word filtering, hyphen stripping, 7-letter pangram detection, SHA-256 word hashing, and cache invalidation.
- [x] Integration tests in `tests/integration/puzzle-archive.test.ts` verify `slot` vs `display_number` across soft-deleted (`is_active = 0`) gaps, `Europe/Helsinki` date rotation, `403` spoiler block on today's `/words`, `404` on inactive slots, and `?all=true` cycle archive.
- [x] `pnpm run check:agent` passes with zero warnings or boundary violations.
