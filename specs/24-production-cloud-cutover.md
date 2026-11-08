# Spec 24: Production Cloud Cutover, Edge Middleware & 1.0 Database Migration Script

Status: shipped
Branch: spec/24-production-cloud-cutover
Reference (1.0): `/Users/erezac/Projects/sanakenno/server/db/schema.sql`, `/Users/erezac/Projects/nuc/nginx/sanakenno.fi.conf`

## 1. Objective

Prepare `sanakenno-next` to serve as the primary production site at `https://sanakenno.fi` on Google Cloud Run: add edge middleware for canonical domain redirects (`next.sanakenno.fi` and `www.sanakenno.fi` → `302 https://sanakenno.fi`), Google-recommended browser security headers, and PWA cache headers; fix migration ordering and historical `player_stats` backfilling; provide a standalone pre-cutover migration script for the on-prem SQLite database; and update the Cloud Run CI workflow for production `BASE_URL` and `RESEND_API_KEY`.

## 2. Invariants & Non-Goals

### Invariants
1. **Canonical Origin (`https://sanakenno.fi`) via Temporary Redirect (`302`):**
   - Requests arriving with `Host` or `X-Forwarded-Host` matching `next.sanakenno.fi` or `www.sanakenno.fi` (except `/api/health`) must return `302 Found` to `https://sanakenno.fi${path}${search}` with `Cache-Control: no-store`.
   - Using `302` (rather than `301`) ensures browsers do not permanently cache the redirect when `next.sanakenno.fi` is later pointed at a separate test Cloud Run service, while keeping all players' `localStorage` and PWA state on the single `https://sanakenno.fi` origin.
2. **Historical Streak & Stats Preservation on 1.0 → 2.0 Migration:**
   - When migrating the on-prem 1.0 `sanakenno.db`, existing `player_stats` rows must be backfilled with:
     - `is_daily = 1` and `played_at_date = date` where `substr(updated_at, 1, 10) = date` (or where the matching `player_puzzle_states.started_at` timestamp in `Europe/Helsinki` falls on `date`), preventing cross-device sync from overwriting local records with `is_daily: false` and resetting players' daily streaks to `0`.
     - `long_words_count` computed from the JSON array `player_puzzle_states.found_words` (words with `length >= 10`).
3. **Curated `blocked_words` Before `puzzles.max_score` Backfill:**
   - Curated offensive words (`0003-seed-curated-blocked-words`) must be seeded before computing `puzzles.max_score` (`0002-add-puzzle-max-score`) so precomputed puzzle maximum scores reflect the exact 2.0 dictionary and blocklist.
4. **Google Web Security Best Practices & Clean SPA Routing on Cloud Run:**
   - Google's Front End (GFE) handles L3/L4 DDoS and high-scale scanning at the network edge, so no legacy `fail2ban` scanner regex lists are needed in application code.
   - Instead, since Sanakenno uses hash routing (`#/admin`) and has no multi-segment client pathname routes, only `/` and `/index.html` serve the SPA HTML shell; any unknown non-asset path naturally returns a clean `404 Not Found`.
   - Because GFE does not inject application browser security headers, Hono middleware sets Google's recommended defense-in-depth headers on all responses: `Content-Security-Policy` (including `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=(), microphone=(), focus-without-user-activation=()`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, and `Cross-Origin-Resource-Policy: same-origin`.
   - `/sw.js` and `/index.html` must be served with `Cache-Control: no-cache` so PWA updates activate immediately.
5. **Non-Destructive Pre-Migration Script:**
   - The standalone migration script must never mutate the input database file in place; it copies the source DB to a new output file, runs all migrations and backfills, runs `PRAGMA wal_checkpoint(TRUNCATE)`, `PRAGMA journal_mode = DELETE`, and `PRAGMA integrity_check`, and outputs a verification summary.

### Non-Goals
- Renaming the `sanakenno-next` repository or the `sanakenno-next` Cloud Run service name.
- Maintaining NUC-style `fail2ban` scanner path regex lists in Hono.
- Provisioning a separate staging Cloud Run service for `next.sanakenno.fi` now (preserved for future test environment use).

## 3. Contract & Architecture

### A. Database Migration & Backfill (`packages/server/src/db/baseline-sql.ts` & `scripts/migrate-v1-db.ts`)
1. **Migration Backfill Logic (`baseline-sql.ts`):**
   - Seed `CURATED_BLOCKED_WORDS` before computing `puzzles.max_score`, and recompute `puzzles.max_score` once `blocked_words` are populated.
   - In `0004-add-player-stats-long-words-and-streak-integrity` (and exported helper `backfillMigratedDatabase(db)`):
     - Update existing `player_stats` rows where `played_at_date IS NULL`:
       - Set `is_daily = 1, played_at_date = date` when `substr(updated_at, 1, 10) = date` or when the matching `(player_id, puzzle_number)` row in `player_puzzle_states` has `started_at > 0` whose `Europe/Helsinki` `YYYY-MM-DD` date equals `player_stats.date`.
       - Set `long_words_count` from the count of words with `length >= 10` in the matching `player_puzzle_states.found_words` JSON array.
2. **Standalone Pre-Migration CLI (`scripts/migrate-v1-db.ts`):**
   - Usage: `pnpm exec tsx scripts/migrate-v1-db.ts <source-db-path> [output-db-path]` (also runnable on the NUC via `docker` / `node`).
   - Safely snapshots `<source-db-path>` into `<output-db-path>` (default `<source-db-path>-v2.db`), runs all migrations + `backfillMigratedDatabase` (recomputing all `puzzles.max_score` against 2.0 `kotus_words.txt` + `blocked_words` and backfilling `player_stats`), checkpoints WAL (`PRAGMA wal_checkpoint(TRUNCATE)`), sets `PRAGMA journal_mode = DELETE` for single-file GCS upload, verifies `PRAGMA integrity_check`, and prints a summary table.

### B. Edge Middleware & Static Serving (`packages/server/src/edge-middleware.ts` & `packages/server/src/index.ts`)
1. **Canonical Host Redirect (`edge-middleware.ts`):**
   - Inspect `X-Forwarded-Host` or `Host` header (stripping port).
   - If host is `next.sanakenno.fi` or `www.sanakenno.fi` and path is not `/api/health`, return `302 Found` with `Location: https://sanakenno.fi${path}${search}` and `Cache-Control: no-store`.
2. **Security Headers (`edge-middleware.ts`):**
   - Apply Google-recommended browser security headers across all responses:
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: camera=(), geolocation=(), microphone=(), focus-without-user-activation=()`
     - `Cross-Origin-Opener-Policy: same-origin-allow-popups`
     - `Cross-Origin-Resource-Policy: same-origin`
     - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
3. **PWA Cache Headers & Clean Root-Only SPA Routing:**
   - Serve `/sw.js` and `/` (`/index.html`) with `Cache-Control: no-cache`.
   - Serve `/manifest.webmanifest` with `Content-Type: application/manifest+json`.
   - Serve `index.html` only on `/` and `/index.html`; return `404` for any unknown non-asset route.

### C. Cloud Run Deployment Workflow (`.github/workflows/ci-web.yml`)
- Update `--set-env-vars` in `.github/workflows/ci-web.yml`:
  - `BASE_URL=https://sanakenno.fi`
  - `LITESTREAM_BUCKET=sanakenno-db-712588936092`
  - `SEED_ON_BOOT=false`
  - `RESEND_API_KEY=${{ secrets.RESEND_API_KEY }}`

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Unit / Edge Middleware (`tests/integration/edge-middleware.test.ts`):**
  - Requests to `Host: next.sanakenno.fi` and `Host: www.sanakenno.fi` (including query strings like `/?transfer=abc`) return `302` to `https://sanakenno.fi/...` with `Cache-Control: no-store`.
  - `/api/health` on `next.sanakenno.fi` and `*.run.app` returns `200 OK` without redirect so infrastructure health probes succeed.
  - Responses include `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and `Content-Security-Policy` (with `object-src 'none'` and `frame-ancestors 'none'`).
  - Unknown non-asset paths return `404` instead of SPA fallback `200`, while `/` and `/index.html` return `200` with `Cache-Control: no-cache`.
  - `/sw.js` is served with `Cache-Control: no-cache`.
- [ ] **Database Migration & Backfill (`tests/integration/db-parity.test.ts`):**
  - Migrating a 1.0 database with existing `player_stats` and `player_puzzle_states` backfills `is_daily = 1` and `played_at_date = date` for puzzles played on their scheduled date, leaves archive plays as `is_daily = 0`, and backfills `long_words_count` from `player_puzzle_states.found_words`.
  - Syncing (`GET /api/player/sync`) after migrating a 1.0 database preserves historical daily streaks (`computeStreak`) and long-word achievement progress (`evaluateAchievements`).
  - `puzzles.max_score` is computed after `CURATED_BLOCKED_WORDS` are seeded.
  - Running `scripts/migrate-v1-db.ts` on a 1.0 SQLite file produces a clean, checkpointed copy passing `PRAGMA integrity_check` without modifying the input file.
- [ ] **Full Mechanical Gate:**
  - `pnpm run check:agent` passes 100%.
