---
name: execute-spec
description: Autonomously implement all approved specs in specs/00-backlog.md back-to-back without git command prompts or shell chaining.
---

# Execute Spec Queue (Continuous Autonomous Loop)

Precondition: One or more specs in `specs/00-backlog.md` have `Status: approved`.

## Terminal & Autonomy Rules (Zero Prompt Friction)

1. **Never Run `git` Commands Between Slices:** Track slice progress strictly via `Status: in-progress` -> `Status: shipped` in `specs/NN-<slug>.md` and `specs/00-backlog.md` using `edit_file`. Do not run `git checkout`, `git add`, `git commit`, or `git merge` between slices.
2. **Never Chain Shell Commands (`&&`, `;`, `|`):** Prefix-based "Always Allow" in the IDE is disabled whenever a command contains `&&`, `;`, `|`, `$()`, or inline env vars. Always execute one standalone command per `run_command` call:
   - `pnpm --dir /Users/erezac/Projects/sanakenno-next run format`
   - `pnpm --dir /Users/erezac/Projects/sanakenno-next run check:agent`
   - `pnpm --dir /Users/erezac/Projects/sanakenno-next run test:e2e`

## For Each `approved` Spec (`specs/NN-<slug>.md`):

1. **Mark `in-progress`:** Use `edit_file` to set `Status: in-progress` in `specs/NN-<slug>.md` and `specs/00-backlog.md`.
2. **Implement Vertical Slice & Tests:** Write code and tests using `write_file` / `edit_file` following `AGENTS.md` boundaries.
3. **Self-Healing Mechanical Gate:** Run `pnpm --dir /Users/erezac/Projects/sanakenno-next run format` and `pnpm --dir /Users/erezac/Projects/sanakenno-next run check:agent` as separate single commands. Fix any failures.
4. **Independent Critic Audit:** Invoke a read-only `research` subagent (`critic-audit`) using only `read_file` (never `run_command`). Fix any blocker findings.
5. **Mark `shipped` & Advance Immediately:** Use `edit_file` to set `Status: shipped` in `specs/NN-<slug>.md` and `specs/00-backlog.md`, update `PROJECT_MAP.md`, and immediately start the next `approved` spec without stopping.
