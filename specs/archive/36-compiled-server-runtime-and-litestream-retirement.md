# Spec 36: Compiled Server Runtime, Litestream Retirement & Cloud Run Optimization

Status: shipped
Branch: spec/36-compiled-server-runtime-and-litestream-retirement

## 1. Objective

Complete the post-cutover migration to **Turso (libSQL)** by retiring Litestream and GCS SQLite replication, compiling `@sanakenno/shared` and `@sanakenno/server` to JavaScript during the Docker build so Cloud Run boots directly via `node` (eliminating runtime Corepack `pnpm` downloads and `tsx` overhead), restoring Cloud Run memory to `512Mi` with multi-instance autoscaling enabled, and aligning all project documentation and license disclosures.

> **Execution Prerequisite:** Do **not** approve or ship this spec until production (`sanakenno.fi`) has been cut over to Turso per `specs/TURSO_MIGRATION_RUNBOOK.md` and confirmed healthy on `"engine": "kysely-libsql"`.

## 2. Invariants & Non-Goals

### Invariants
- **Zero Runtime Package Downloads or TS Transpilation:** The production Docker container must run compiled JavaScript directly (`node packages/server/dist/index.js`) with zero `corepack`, `pnpm`, or `tsx` invocation at container startup.
- **Secret Manager Hygiene:** `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are injected into Cloud Run exclusively via GCP Secret Manager (`--update-secrets` in `.github/workflows/ci-web.yml`), never as plaintext env vars in workflow files or container layers.
- **Local Dev & Test Parity Preserved:** `pnpm run dev`, `pnpm run db:seed`, and `pnpm run check:agent` continue using local `better-sqlite3` with zero Turso account requirement.
- **Operational Safety Retained:** `MAINTENANCE_MODE=true` remains supported in `packages/server/src/index.ts` as a zero-DB emergency switch.
- **Documentation & License Single-Ownership:** `PROJECT_MAP.md`, `README.md`, `OPEN_SOURCE_LICENSES.md`, and `packages/web/src/features/modals/licenses.ts` reflect the Turso + Cloud Run architecture accurately with no changelog prose (`"used to"`, `"previously"`, `"no longer"`, etc.).

### Non-Goals
- Deleting the historical backup archive in `gs://sanakenno-db-712588936092/backups/` (retain as cold backup in GCS until manually retired by the owner).
- Changing gameplay, sync logic, or admin features.

## 3. Contract & Architecture

### A. Compiled Server & Shared Build (`packages/shared`, `packages/server`, `package.json`)
- Add `tsconfig.build.json` and `"build": "tsc -p tsconfig.build.json"` scripts in `packages/shared` and `packages/server` emitting ESM JS to `packages/shared/dist` and `packages/server/dist` (ensuring `packages/server/assets/` path resolution in `wordlist.ts` and `suggestion-engine.ts` resolves reliably from both `src/` and `dist/`).
- Update `packages/shared/package.json` `exports` (or conditional `types`/`default` export conditions) so Vitest/Vite/TypeScript resolve TypeScript sources seamlessly in dev/test while compiled `node packages/server/dist/index.js` resolves `packages/shared/dist/index.js` cleanly in production.
- Update root `package.json` `"build"` script to build `@sanakenno/shared`, `@sanakenno/server`, and `@sanakenno/web` so `pnpm run check:agent` continuously verifies server compilation.

### B. Lean Production Container (`Dockerfile`) & Litestream Retirement
- Delete `litestream.yml` and `scripts/entrypoint.sh`.
- Update `Dockerfile`:
  - Remove `COPY --from=litestream/litestream:...`, `VOLUME /data`, `/data` mkdir, `DATA_DIR`, `DB_PATH`, and `curl` (no longer needed for GCS seed fallback).
  - Build `@sanakenno/shared`, `@sanakenno/server`, and `@sanakenno/web` in the `build` stage.
  - In the `runtime` stage, copy compiled `packages/shared/dist`, `packages/server/dist`, `packages/server/assets`, and built `packages/web/dist` (`./dist`), plus production `node_modules` (no `corepack` / `pnpm` needed at runtime).
  - Set `CMD ["node", "packages/server/dist/index.js"]`.

### C. Cloud Run CI/CD Optimization (`.github/workflows/ci-web.yml`)
- Update `gcloud run deploy sanakenno-next`:
  - Remove `LITESTREAM_BUCKET=...` from `--set-env-vars` (keep `BASE_URL=https://sanakenno.fi,SEED_ON_BOOT=false,GIT_COMMIT=${{ github.sha }}`).
  - Add `--update-secrets TURSO_DATABASE_URL=turso-database-url:latest,TURSO_AUTH_TOKEN=turso-auth-token:latest` (preserving existing `ADMIN_INITIAL_PASSWORD` and `RESEND_API_KEY` secrets).
  - Lower `--memory 1Gi` back to `--memory 512Mi`.
  - Increase `--max-instances 1` to `--max-instances 3` for safe zero-downtime rolling deploys and burst capacity.
  - Keep live verification polling `/api/health` for `"status":"ok"` and `"engine":"kysely-libsql"`.

### D. Documentation & License Attribution
- **`PROJECT_MAP.md`:** Update workspace layout (remove `litestream.yml` / `scripts/entrypoint.sh`) and §3 (*Production Runtime & Database Persistence*) to describe Cloud Run (`europe-north1`) backed by managed Turso (libSQL, `aws-eu-north-1`) with local `better-sqlite3` for development/testing.
- **`README.md`:** Update stack summary and deployment notes to reflect Turso + Cloud Run.
- **`OPEN_SOURCE_LICENSES.md` & `packages/web/src/features/modals/licenses.ts`:** Replace `Litestream` (`Apache-2.0`) with `libSQL (@libsql/client)` (`MIT`, Turso).

## 4. Acceptance Criteria & Verification

### New / Updated Tests (real boundaries, not mock-only)

- [x] **Compiled Runtime Smoke (`tests/integration/compiled-server-boot.test.ts` or build verification):** After `pnpm run build`, verify asset resolution (`kotus_words.txt`, `pangram-quality.json`) works from compiled `packages/server/dist/` and `node packages/server/dist/index.js` boots cleanly in `MAINTENANCE_MODE=true` or against a temp SQLite DB and serves `GET /api/health`.
- [x] **Architecture (`tests/architecture.test.ts`):** Verify `PROJECT_MAP.md`, `README.md`, `OPEN_SOURCE_LICENSES.md`, and `licenses.ts` pass all single-ownership and no-changelog-prose checks, and contain no stale `Litestream` references.

### Visual & Mechanical Gate

- [x] **Visual Inspection (`pnpm run screenshot settings`):** Inspect desktop (1280px) and mobile (390px) screenshots of `SettingsModal` to verify the updated `libSQL` license attribution renders cleanly.
- [x] **Mechanical Gate:** `pnpm run check:agent` passes 100% (including compiling `@sanakenno/shared`, `@sanakenno/server`, and `@sanakenno/web`).
