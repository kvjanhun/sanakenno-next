# Spec 09: PWA, Production Deployment & Switchover Verification

Status: approved
Branch: spec/09-pwa-and-production-switchover
Reference (1.0):

- `/Users/erezac/Projects/sanakenno/packages/web/pwa.config.js`
- `/Users/erezac/Projects/sanakenno/Dockerfile`
- `/Users/erezac/Projects/sanakenno/docker-compose.yml`
- `/Users/erezac/Projects/sanakenno/server/deploy-sanakenno.sh`
- `/Users/erezac/Projects/sanakenno/.github/workflows/ci-web.yml`
- `/Users/erezac/Projects/sanakenno/tests/e2e/`

## 1. Objective

Complete production readiness: configure `vite-plugin-pwa`, multi-stage Docker build, dual-container zero-downtime deployment (`sanakenno-a` / `sanakenno-b`), CI workflow (`ci-web.yml`), full E2E verification against a real snapshot of `sanakenno.db` and `kotus_words.txt`, and a clear NUC server switchover checklist.

## 2. Invariants & Non-Goals

- **Never Run Docker Locally:** Per operator rules, `docker` and `docker compose` commands must never be executed on the local macOS machine; container configs are validated via syntax/lint checks and executed only by the remote NUC deploy pipeline.
- **Production Safety Contracts:** Preserve `/data/sanakenno.db` volume mount (for Litestream B2 replication), dual-instance health checks (`:8081` and `:8082`), `/commit.txt` build-stamp verification, and `/api/*` network-only PWA workbox routing.
- **Clean Monorepo Layout:** Place the deployment script at `scripts/deploy-sanakenno.sh` (with a documented NUC webhook path update in the switchover checklist).

## 3. Contract & Architecture

- **`@sanakenno/web`:**
  - `pwa.config.ts` + `vite-plugin-pwa` integration, manifest, icons, and iOS/Android install instructions modal.
- **Root Infrastructure & CI:**
  - `Dockerfile` (builds `@sanakenno/web`, stamps `GIT_COMMIT` into `./dist/commit.txt`, runs `@sanakenno/server` under Node 22 Alpine with `TZ=Europe/Helsinki`).
  - `docker-compose.yml` (`sanakenno-a` and `sanakenno-b` sharing `/data`).
  - `scripts/deploy-sanakenno.sh` and `.github/workflows/ci-web.yml` (runs `pnpm run check:agent`, `pnpm run test:e2e`, triggers deploy webhook, and polls `https://sanakenno.fi/commit.txt`).
- **Switchover Verification:**
  - `tests/integration/production-snapshot.test.ts` opening a copy of 1.0's `sanakenno.db` and `kotus_words.txt` and verifying every query and route.

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit/PWA tests verify Workbox `navigateFallbackDenylist` (`/^\/api\//`) and manifest metadata.
- [ ] Integration test verifies opening a real 1.0 `sanakenno.db` + `kotus_words.txt` snapshot without migration or query errors.
- [ ] Full Playwright E2E suite (`pnpm run test:e2e`) and `pnpm run check:agent` pass 100%.
