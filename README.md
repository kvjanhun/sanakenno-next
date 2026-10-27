# Sanakenno Next

Agent-first development environment for **Sanakenno 2.0** (sanakenno.fi).

- **How to operate the agent-first workflow:** see [AGENTS.md](AGENTS.md).
- **Architecture & domain invariants:** see [PROJECT_MAP.md](PROJECT_MAP.md).
- **Active migration specs & backlog:** see [specs/00-backlog.md](specs/00-backlog.md).

## Quickstart

```sh
pnpm install
pnpm run check:agent   # Typecheck + Lint + Architecture Fitness + Unit/Integration + Build
pnpm run dev           # Start Hono API (:3001) + Vite Web (:5173)
```
