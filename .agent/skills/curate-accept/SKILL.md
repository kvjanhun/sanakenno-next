---
name: curate-accept
description: Finalize a slice after passing pnpm check:agent and critic-audit (or after human review of a ready-for-curation spec) — update PROJECT_MAP.md, mark spec as shipped, and create an atomic Conventional Commit on main.
---

# Curate Accept / Auto-Ship Slice

Used either automatically at Step 5 of `execute-spec` (after `pnpm run check:agent` + `critic-audit` `VERDICT: PASS`) or manually when a single spec was paused in `ready-for-curation`.

## Steps

1. Flip `Status: shipped` in `specs/NN-<slug>.md` and `specs/00-backlog.md`.
2. Update `PROJECT_MAP.md` if new feature slices, endpoints, or data flows were added (remember single-ownership and "Documentation is not a journal" from `AGENTS.md`).
3. Run `pnpm run check:agent` one final time to verify docs/formatting/spec-sync.
4. Merge the spec branch cleanly to `main` with an atomic Conventional Commit (`feat: ...` or `refactor: ...`). Never push to remote unless explicitly requested.
