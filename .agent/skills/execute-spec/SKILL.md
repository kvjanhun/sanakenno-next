---
name: execute-spec
description: Autonomously implement all approved specs in specs/00-backlog.md back-to-back. For each spec: implement slice + tests, pass pnpm check:agent, pass independent critic-audit subagent, merge atomically to main as shipped, and immediately advance to the next approved spec.
---

# Execute Spec Queue (Continuous Autonomous Loop)

Precondition: One or more specs in `specs/00-backlog.md` have `Status: approved`.

**CRITICAL RULE:** Never stop after implementing just one spec when more `approved` specs remain in `specs/00-backlog.md`. Loop through Steps 1–5 for **every** `approved` spec in sequence, then deliver a single Curation Brief in Step 6.

## For Each `approved` Spec (`specs/NN-<slug>.md`):

### Step 1: Isolate Slice Work

Create or switch to branch `spec/NN-<slug>`. Update status to `in-progress` in both `specs/NN-<slug>.md` and `specs/00-backlog.md`.

### Step 2: Implement Vertical Slice & Behaviour Tests

Delegate to a `self` subagent or build directly following `AGENTS.md` boundaries:

- Shared Zod schemas & pure domain functions in `@sanakenno/shared`.
- Typed Kysely queries in `packages/server/src/features/<slice>/<slice>.queries.ts`.
- Method-chained Hono RPC routes in `packages/server/src/features/<slice>/<slice>.routes.ts`.
- React UI & TanStack Query hooks in `packages/web/src/features/<slice>/` using `src/api/client.ts`.
- Unit, integration (in-memory SQLite), and E2E tests proving every acceptance criterion in the spec.

### Step 3: Self-Healing Mechanical Gate

Run `pnpm run check:agent` (and `pnpm run test:e2e` when UI or routes change). Fix any type, lint, architecture boundary, or test failures autonomously.

### Step 4: Independent Critic Audit

Invoke a read-only `research` subagent with `.agent/skills/critic-audit/SKILL.md` to audit the diff against `specs/NN-<slug>.md`. If `VERDICT: NEEDS_WORK`, fix all blocker findings and re-run `pnpm run check:agent` + `critic-audit` until `VERDICT: PASS`.

### Step 5: Auto-Ship Slice & Advance to Next Approved Spec

Once `check:agent` + `critic-audit` (`VERDICT: PASS`) both succeed:

1. Flip `Status: shipped` in `specs/NN-<slug>.md` and `specs/00-backlog.md`.
2. Update `PROJECT_MAP.md` if structure, endpoints, or data flows changed.
3. Run `pnpm run check:agent` to verify doc/spec sync.
4. Merge `spec/NN-<slug>` cleanly to `main` with an atomic Conventional Commit (`feat: ...`).
5. **Immediately check `specs/00-backlog.md`**: if another `approved` spec exists, loop back to Step 1 for that spec without stopping.

## Step 6: Deliver the 1-Screen Curation Brief (<25 lines)

Only when **all** `approved` specs in `specs/00-backlog.md` are `shipped`, output at most 25 lines summarizing the shipped batch.
