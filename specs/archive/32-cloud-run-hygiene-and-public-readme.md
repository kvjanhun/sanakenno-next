# Spec 32: Cloud Run Production Hygiene & Public README

Status: shipped
Branch: spec/32-cloud-run-hygiene-and-public-readme

## 1. Objective

Align the repository's production runtime, container build, documentation, and developer quickstart with the live Google Cloud Run architecture: add graceful `SIGTERM`/`SIGINT` shutdown with SQLite WAL checkpointing in `packages/server/src/index.ts`; stamp `GIT_COMMIT` and prune devDependencies in the production container; auto-seed empty local development databases so `pnpm run dev` works out of the box on a fresh clone; clean up obsolete NUC/Backblaze/Lucide references; and write a welcoming, informative public `README.md`.

## 2. Invariants & Non-Goals

### Invariants
1. **Graceful Cloud Run Shutdown & WAL Flush:**
   - `packages/server/src/index.ts` must handle `SIGTERM` and `SIGINT` by closing the HTTP server, running `PRAGMA wal_checkpoint(TRUNCATE)` (or `db.destroy()`), and exiting cleanly so Litestream can flush the final SQLite state to GCS before container termination.
2. **Zero-Config Fresh Clone (`pnpm run dev`):**
   - When running in development (`NODE_ENV !== 'production'` and `dbPath === './sanakenno.dev.db'`), if the `puzzles` table is empty (`0` rows), `packages/server/src/index.ts` automatically runs `await seedDatabase(db)` so a fresh clone running `pnpm install && pnpm run dev` immediately serves a playable puzzle.
3. **Production Container & License Accuracy:**
   - `Dockerfile` must activate the exact `pnpm` version from `package.json` (`corepack enable && corepack prepare --activate`), prune devDependencies in the runtime stage (`pnpm prune --prod`), and stamp `GIT_COMMIT`.
   - `packages/web/package.json` must list `@sanakenno/server` under `devDependencies` (since it is a type-only dependency).
   - `OPEN_SOURCE_LICENSES.md` and `packages/web/src/features/modals/licenses.ts` must reflect only packages and datasets actually used in the project (removing the unused `Lucide Icons` entry).
   - `PROJECT_MAP.md` must accurately describe the current Google Cloud Run + GCS Litestream architecture without legacy NUC / Backblaze B2 prose, while respecting `tests/architecture.test.ts` single-ownership rules (no changelog phrases like `"used to"` or `"previously"`).

### Non-Goals
- Deleting `docker-compose.yml` if still desired as an optional self-hosted reference (or keeping it clearly scoped as optional local/self-hosted compose config).
- Changing any gameplay or admin UI features.

## 3. Contract & Architecture

### A. Server Graceful Shutdown & Auto-Seed (`packages/server/src/index.ts` & `scripts/create-admin.ts`)
- Extract a testable `shutdownServer(server, db)` helper or lifecycle handler in `packages/server/src/index.ts`:
  - On `SIGTERM` / `SIGINT`, close the `@hono/node-server` instance and call `await db.destroy()` (which closes the `better-sqlite3` connection and checkpoints WAL).
- On boot in `packages/server/src/index.ts`:
  - Seed when `process.env.SEED_ON_BOOT === 'true'` **or** when `process.env.NODE_ENV !== 'production'` and the `puzzles` table has 0 rows.
- In `scripts/create-admin.ts`:
  - Read `process.env.DB_PATH || process.env.DATABASE_PATH || './sanakenno.db'` for consistency with `connection.ts`.

### B. Container, CI & Package Hygiene (`Dockerfile`, `.github/workflows/ci-web.yml`, `package.json`, `packages/web/package.json`)
- **`Dockerfile`:**
  - Replace `corepack prepare pnpm@latest --activate` with `corepack enable`.
  - In the `runtime` stage, run `pnpm install --prod --frozen-lockfile` (or `pnpm prune --prod`) before removing `python3 make g++` so test/build tools are excluded from the runtime image.
- **`.github/workflows/ci-web.yml`:**
  - Pass `GIT_COMMIT=${{ github.sha }}` to the Cloud Run deployment (`--set-build-env-vars` / `--set-env-vars`) and support `process.env.GIT_COMMIT` fallback for `/commit.txt` in `edge-middleware.ts` so `https://sanakenno.fi/commit.txt` always reports the live commit SHA on Cloud Run.
- **`packages/web/package.json`:**
  - Move `"@sanakenno/server": "workspace:*"` from `dependencies` to `devDependencies`.

### C. Documentation & License Cleanup (`README.md`, `PROJECT_MAP.md`, `OPEN_SOURCE_LICENSES.md`, `licenses.ts`)
- **`README.md`:**
  - Expand into a welcoming public repository overview for visitors arriving from `sanakenno.fi`: brief description of Sanakenno (Finnish daily honeycomb word game at [sanakenno.fi](https://sanakenno.fi) powered by Kotus *Nykysuomen sanalista* under CC BY 4.0), architecture overview table, links to `AGENTS.md`, `PROJECT_MAP.md`, `specs/00-backlog.md`, and `OPEN_SOURCE_LICENSES.md`, and a working Quickstart.
- **`PROJECT_MAP.md`:**
  - Update §3 (*Production & Database Persistence*) to state the current Google Cloud Run + GCS Litestream architecture and `/commit.txt` verification.
- **`OPEN_SOURCE_LICENSES.md` & `packages/web/src/features/modals/licenses.ts`:**
  - Remove the unused `Lucide Icons` entry so license disclosures match actual dependencies.

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Integration (`tests/integration/edge-middleware.test.ts` & `server-lifecycle.test.ts`):**
  - `/commit.txt` serves the stamped commit or `GIT_COMMIT` env var accurately.
  - Auto-seed populates an empty development database when `puzzles` count is 0.
  - Graceful shutdown closes the database connection cleanly.
- [ ] **Architecture & Docs (`tests/architecture.test.ts`):**
  - `README.md`, `PROJECT_MAP.md`, and `OPEN_SOURCE_LICENSES.md` pass all single-ownership and no-changelog-prose checks.
  - `OPEN_SOURCE_LICENSES.md` and `licenses.ts` contain no unused `Lucide` references.
- [ ] **Mechanical Gate:**
  - `pnpm run check:agent` passes 100%.
