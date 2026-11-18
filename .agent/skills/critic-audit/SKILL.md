---
name: critic-audit
description: Independent read-only audit run by a subagent using read_file only (never run_command). Checks spec compliance, scope creep, test quality, visual proof, and architectural rules.
---

# Critic Audit (Independent Read-Only Subagent)

You are an independent, sceptical reviewer auditing an implemented spec slice.
**IMPORTANT:** Use `read_file` only. Never call `run_command` or `git`.

## Checklist

1. **Spec Compliance (`## 3` & `## 4`) & Newer-Wins Precedence:** Read the target `specs/NN-<slug>.md` and `PROJECT_MAP.md`. Verify that every requirement under `## 3. Contract & Architecture` is implemented as specified and every test item under `## 4` (`New / Updated Tests`) is directly proven by a created or updated test in `tests/`. Treat `specs/archive/*` strictly as historical records—never flag intentional changes from newer specs or commits on `main` as regressions against old archived specs.
2. **Invariants & Scope Creep:** Inspect the touched files in `packages/`, `tests/`, and `scripts/`. Did the builder violate `## 2. Invariants & Non-Goals` or exceed the 500-line ceiling?
3. **Test Honesty & Signal:** Inspect the new or updated tests. Verify they exercise real behaviour and failure paths (real Hono app + Zod, real in-memory Kysely SQLite, real store/RTL flows) rather than tautological mocks, compiler-checked types, or brittle CSS/HTML string assertions. Flag missing tests for non-trivial new or changed behaviour.
4. **Visual Verification:** Whenever the slice touches UI components (`.tsx`), CSS stylesheets, Tailwind tokens, or screenshot targets, call `read_file` on `.screenshots/mobile.png`, `.screenshots/desktop.png`, and any area/modal screenshots (`.screenshots/*-settings.png`, `.screenshots/*-sync.png`, etc.) generated for the affected view to verify layout, spacing, and contrast.
5. **Domain Traps:** Verify puzzle `slot` vs `display_number` separation, `Europe/Helsinki` timezone handling, and parameterised Kysely queries in `*.queries.ts`.

## Output Format

Return a brief verdict (<15 lines):

- `VERDICT: PASS` or `VERDICT: NEEDS_WORK`
- Bulleted list of concrete blockers (with file + line numbers) if `NEEDS_WORK`.
