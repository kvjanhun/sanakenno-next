# Sanakenno 2.0 — Project Map

High-level map of what exists in `sanakenno-next` and core domain invariants.

## Workspace Layout

```text
sanakenno-next/
  AGENTS.md                  # Agent-first operating rules & 1-Screen Curation Brief mandate
  PROJECT_MAP.md             # Current architecture & domain invariants
  specs/                     # Sequenced specs driving autonomous implementation
  packages/
    shared/                  # @sanakenno/shared — Zod schemas & pure Finnish game logic
    server/                  # @sanakenno/server — Hono RPC API + Kysely SQLite layer
      src/
        db/                  # Kysely Database<Schema>, connection factory, deterministic seed
        features/
          health/            # Canary vertical slice (GET /api/health)
    web/                     # @sanakenno/web — React 19 + TanStack Query + Hono RPC client
      src/
        api/                 # Typed Hono RPC client (hc<AppType>)
        features/
          system-status/     # Canary UI verifying end-to-end Kysely → Hono RPC → React flow
        styles/              # CSS custom property design tokens (--color-*, --font-*)
  tests/
    architecture.test.ts     # Mechanical boundary & monolith guardrails
    integration/             # In-memory Kysely SQLite + Hono testClient specs
    e2e/                     # Ephemeral Playwright specs
```

---

## Core Domain Invariants (Preserved from Sanakenno 1.0)

### 1. Puzzle Numbering (`slot` vs `display_number`)

Two numbers identify a puzzle and are **never** interchangeable:

- **`slot`** (`puzzle_number` in storage/API): Permanent primary key. Soft-deleted puzzles keep their `slot` forever so `player_stats`, `player_puzzle_states`, `word_finds`, and `localStorage` keys stay valid. New puzzles append at `nextFreeSlot()`.
- **`display_number`**: 1-based index among _active_ (`is_active = 1`) puzzles. Soft-deleting a puzzle closes the gap. Cycle positions must always be derived from active slot indices, never slot arithmetic.

### 2. Timezone

Daily puzzle rotation strictly follows `Europe/Helsinki` midnight.

### 3. Language Convention

- All user-facing UI strings: **Finnish**.
- All code, identifiers, comments, specs, and tests: **English**.
