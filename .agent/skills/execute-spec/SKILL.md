---
name: execute-spec
description: Autonomously implement an approved spec on a feature branch, run pnpm check:agent and E2E verification, run the independent critic subagent audit, and present a 1-Screen Curation Brief (<25 lines).
---

# Execute Spec (Autonomous Loop)

Precondition: The target spec in `specs/NN-<slug>.md` must have `Status: approved`.

## Step 1: Isolate Work

Create or switch to a dedicated branch `spec/NN-<slug>` (or run inside a subagent with `Workspace: "share"`). Update the spec status to `in-progress`.

## Step 2: Implement Vertical Slice & Behaviour Tests

Build the feature following the repository boundaries in `AGENTS.md`:

- Shared Zod schemas & pure domain functions in `@sanakenno/shared`.
- Typed Kysely queries in `packages/server/src/features/<slice>/<slice>.queries.ts`.
- Hono RPC routes in `packages/server/src/features/<slice>/<slice>.routes.ts`.
- React UI & TanStack Query hooks in `packages/web/src/features/<slice>/` using `src/api/client.ts`.
- Descriptive unit, integration (in-memory SQLite), and E2E tests that match every acceptance criterion in the spec.

## Step 3: Self-Healing Mechanical Gate

Run:

```sh
pnpm run check:agent
```

If UI or routes changed, also run:

```sh
pnpm run test:e2e
```

Fix any type, lint, architecture boundary, or test failures autonomously. Do not stop on red checks.

## Step 4: Independent Critic Audit

Invoke a read-only `research` subagent with instructions to follow `.agent/skills/critic-audit/SKILL.md` against your branch diff and `specs/NN-<slug>.md`. Address any blocker findings it reports and re-run `pnpm run check:agent`.

## Step 5: Deliver the 1-Screen Curation Brief (<25 lines)

Flip the spec status to `ready-for-curation` and output **at most 25 lines**:

- **Changes & Why (3–5 bullets):** Only non-obvious architectural/domain decisions.
- **Blast Radius:** Touched modules, DB tables, and RPC routes.
- **Proof:** Key behaviour test names + 1–2 screenshots (if UI changed).
- **Curator Action:** Any product/UX trade-off to confirm, or ask to run `curate-accept`.
