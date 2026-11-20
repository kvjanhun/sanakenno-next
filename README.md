# Sanakenno

**Sanakenno** ([sanakenno.fi](https://sanakenno.fi)) is a Finnish daily honeycomb word game built as an agent-first TypeScript monorepo. Each daily puzzle presents seven Finnish letters around a mandatory center letter, using a curated word list derived from the Institute for the Languages of Finland's (*Kotus*) **Nykysuomen sanalista** under CC BY 4.0.

## Highlights

- **Daily Rotation & Archive:** New puzzle every midnight in `Europe/Helsinki`, with server-locked future slots, playable archive history, streak tracking, milestones, and multi-tier achievements.
- **Offline-Ready PWA:** Built with `vite-plugin-pwa` + Workbox (`NetworkOnly` on `/api/*`) and bounded local caching of active puzzles for seamless offline reopen.
- **Passwordless Cross-Device Sync:** Optional anonymous Bearer sessions with monotonic stats/state reconciliation, 6-digit pairing codes, and EU email transfer links via Resend.
- **Type-Safe End-to-End Stack:** Shared pure domain rules and Zod schemas flow cleanly from Turso (libSQL) / SQLite (Kysely) through Hono RPC (`hc<AppType>`) into React 19 + TanStack Query.

## Workspace Architecture

| Package | Path | Responsibility |
| :--- | :--- | :--- |
| `@sanakenno/shared` | `packages/shared` | Pure Finnish scoring, ranks, streaks, achievements, Kotus lemma links, theme IDs, and shared Zod schemas (zero I/O). |
| `@sanakenno/server` | `packages/server` | Hono API + `@hono/zod-validator` routes, Kysely dual-engine layer (Turso libSQL in production, `better-sqlite3` locally), edge security middleware, and SPA serving. |
| `@sanakenno/web` | `packages/web` | React 19 + Vite PWA + Tailwind CSS 4 UI, Zustand stores, TanStack Query, typed `apiClient`, and admin panel. |

## Quickstart

```sh
pnpm install
pnpm run dev           # Starts Hono API (:3001, auto-seeds empty local SQLite dev DB) + Vite Web (:5173)
pnpm run check:agent   # Format + Typecheck + ESLint + Architecture Fitness + Unit/Integration + Build
```

## Production Deployment

Sanakenno deploys to **Google Cloud Run** (`europe-north1`, `512Mi` RAM, `--max-instances 3`) via [`.github/workflows/ci-web.yml`](.github/workflows/ci-web.yml) and [`Dockerfile`](Dockerfile):

- The multi-stage Docker build compiles `@sanakenno/shared`, `@sanakenno/server`, and `@sanakenno/web`, booting directly via `node packages/server/dist/index.js`.
- Production data lives in managed **Turso (libSQL)** (`aws-eu-north-1`) with credentials injected through GCP Secret Manager (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
- Graceful `SIGTERM` / `SIGINT` shutdown in `packages/server/src/index.ts` drains HTTP connections and closes the database pool cleanly.
- `GIT_COMMIT` is stamped on deployment and exposed at `/commit.txt` with `Cache-Control: no-store`.

## Documentation & Licenses

- **Architecture & Domain Invariants:** [PROJECT_MAP.md](PROJECT_MAP.md)
- **Agent Operating Rules:** [AGENTS.md](AGENTS.md)
- **Roadmap & Specs:** [specs/00-backlog.md](specs/00-backlog.md)
- **Open Source & Data Attribution:** [OPEN_SOURCE_LICENSES.md](OPEN_SOURCE_LICENSES.md)
