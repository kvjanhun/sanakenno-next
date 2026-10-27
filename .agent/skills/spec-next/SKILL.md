---
name: spec-next
description: Draft or refine the next spec in specs/ from specs/00-backlog.md and pause for human approval before any implementation begins.
---

# Spec Next

Use this skill when preparing the next unit of work in `specs/`.

## Process

1. **Read `specs/00-backlog.md`** to identify the next `pending` or `draft` spec (or the specific spec requested by the user).
2. **Inspect the reference implementation** (if migrating from `/Users/erezac/Projects/sanakenno`) so the spec captures exact domain rules, edge cases, and database compatibility requirements.
3. **Write or update `specs/NN-<slug>.md`** using `specs/TEMPLATE.md` with `Status: draft`.
4. **Stop for approval:** Present a concise summary of the spec and any open questions (or suggest `/grill-me` if requirements need interactive refinement). Never write feature code while status is `draft`.
5. When the user approves, set `Status: approved` in both the spec file and `specs/00-backlog.md`.
