---
name: curate-accept
description: Finalize a curated spec after human approval — update PROJECT_MAP.md if structure changed, mark spec as shipped, and create an atomic Conventional Commit on main.
---

# Curate Accept

Use only after the human curator explicitly approves a `ready-for-curation` spec.

## Steps

1. Flip `Status: shipped` in `specs/NN-<slug>.md` and `specs/00-backlog.md`.
2. Update `PROJECT_MAP.md` if new feature slices, endpoints, or data flows were added (remember single-ownership and "Documentation is not a journal" from `AGENTS.md`).
3. Run `pnpm run check:agent` one final time to verify docs/formatting.
4. Merge the spec branch cleanly to `main` with an atomic Conventional Commit (`feat: ...` or `refactor: ...`). Never push to remote unless explicitly requested.
