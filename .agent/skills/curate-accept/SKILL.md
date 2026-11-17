---
name: curate-accept
description: Finalize a slice after passing pnpm check:agent and critic-audit — update PROJECT_MAP.md, mark spec as shipped, archive it in specs/archive/, and create an atomic Conventional Commit on main.
---

# Curate Accept / Auto-Ship Slice

Used either automatically at Step 5 of `execute-spec` (after `pnpm run check:agent` + `critic-audit` `VERDICT: PASS`) or manually when a single spec was paused in `ready-for-curation`.

## Steps

1. Flip `Status: shipped` in `specs/NN-<slug>.md`, move the spec file to `specs/archive/NN-<slug>.md`, and update `specs/00-backlog.md` (status `shipped` and `archive/` link).
2. Update `PROJECT_MAP.md` if new feature slices, endpoints, scripts, or data flows were added (remember single-ownership and "Documentation is not a journal" from `AGENTS.md`).
3. Run `pnpm --dir /Users/erezac/Projects/sanakenno-next run check:agent` one final time to verify docs, formatting, architecture fitness, tests, and spec sync.
4. Commit the finalized slice cleanly on `main` with an atomic Conventional Commit (`feat: ...`, `fix: ...`, `refactor: ...`, or `chore: ...`). Never push to remote unless explicitly requested.
