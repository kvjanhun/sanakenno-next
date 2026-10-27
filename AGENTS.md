# Sanakenno 2.0 — Agent-First Operating Rules

## 1. Operating Model: Spec → Execute → Critic → Curate

This repository is operated **agent-first**. You (the agent) work autonomously inside mechanical guardrails and present finished, verified increments for human curation.

### The 4 Laws

1. **No Code Without an Approved Spec:**
   - Every non-trivial change starts as a spec file in [`specs/`](specs/00-backlog.md) with `Status: approved`.
   - If a spec is `draft` or underspecified, refine it first (use `/grill-me` or the `spec-next` skill) and stop for sign-off.
2. **Mechanical Gate Before Hand-Off (`pnpm check:agent`):**
   - Never hand work back to the user until `pnpm run check:agent` passes 100% (TypeScript across Kysely + Hono RPC + React, ESLint/Prettier, `tests/architecture.test.ts`, Vitest unit/integration, and production build).
   - If UI or routes changed, also run `pnpm run test:e2e` (or inspect via Playwright / Chrome DevTools MCP).
3. **Independent Critic Audit:**
   - Before presenting a solution for curation, invoke a read-only subagent using the `critic-audit` skill to verify the diff against the approved spec, check for scope creep, and confirm test quality.
4. **The 1-Screen Curation Brief (<25 lines):**
   - Never dump long logs or 1,000-line essays after an autonomous run.
   - Present a **Curation Brief** in **under 25 lines**:
     - **Changes & Why (3–5 bullets):** Only non-obvious architectural or domain choices.
     - **Blast Radius:** Touched feature slices, DB tables, or RPC endpoints.
     - **Proof:** Key test names added + 1–2 embedded screenshots (when UI changes).
     - **Curator Prompt:** Any UX/product judgment call, or "Ready to merge via `curate-accept`."

---

## 2. Tech Stack & Architectural Boundaries

Enforced mechanically by [`tests/architecture.test.ts`](tests/architecture.test.ts):

| Layer         | Tech                                            | Mechanical Rule                                                                            |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Shared domain | `@sanakenno/shared` (Zod + pure TS)             | Pure functions & shared schemas only. Zero I/O or framework imports.                       |
| Database      | SQLite (`better-sqlite3`) + **Kysely**          | All SQL lives in `*.queries.ts` modules using typed Kysely queries.                        |
| API Server    | **Hono** + **Hono RPC** (`hc<AppType>`)         | Route files (`*.routes.ts`) validate via Zod and call `*.queries.ts`; never raw SQL.       |
| Web Frontend  | **React 19** + **TanStack Query** + **Zustand** | Never call `fetch()` directly in components/stores; always go through `src/api/client.ts`. |
| Styling       | **Tailwind CSS 4** + CSS custom properties      | Use `var(--color-*)` design tokens; never hardcode hex colours in `.tsx` files.            |
| File cohesion | Vertical feature slices                         | Keep files focused by responsibility; files >500 lines fail the architecture check.        |

---

## 3. Commands

```sh
pnpm run check:agent     # Full mechanical gate: typecheck + lint + test:arch + test:unit + build
pnpm run test:arch       # Run architectural fitness tests only
pnpm run test:unit       # Run Vitest unit + in-memory SQLite integration tests
pnpm run test:e2e        # Run self-contained Playwright E2E suite (auto-starts isolated server + web)
pnpm run db:seed         # Seed local development SQLite database
pnpm run dev             # Start local Hono API (:3001) + Vite web (:5173)
```

---

## 4. Documentation Single-Ownership

Every fact lives in **one** file:

- **How to work here (rules, commands, agent workflow):** `AGENTS.md` (`CLAUDE.md` and `GEMINI.md` are symlinks to `AGENTS.md`).
- **What exists now (structure, data flows, domain invariants):** [`PROJECT_MAP.md`](PROJECT_MAP.md).
- **What is planned or in progress:** [`specs/00-backlog.md`](specs/00-backlog.md) and individual `specs/NN-*.md` files.
- **Public intro & quickstart:** [`README.md`](README.md).

Docs state what is true _now_—never write changelog prose ("used to", "previously", "was moved") in documentation.
