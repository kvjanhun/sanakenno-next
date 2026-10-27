# Spec NN: <Title>

Status: draft
Branch: spec/NN-<slug>
Reference (1.0): <paths in /Users/erezac/Projects/sanakenno if applicable>

## 1. Objective

One or two sentences stating what capability this vertical slice adds.

## 2. Invariants & Non-Goals

- What domain rules must hold (e.g. `slot` vs `display_number`, SQLite schema parity with production `sanakenno.db`).
- What is explicitly **out of scope** for this spec so the agent does not over-build.

## 3. Contract & Architecture

- **Shared Schemas / Logic (`@sanakenno/shared`):**
- **Kysely Queries (`@sanakenno/server`):**
- **Hono RPC Routes (`@sanakenno/server`):**
- **Frontend Slice (`@sanakenno/web`):**

## 4. Acceptance Criteria (Test Catalog)

- [ ] Unit / Domain: ...
- [ ] Integration (Kysely + Hono in-memory SQLite): ...
- [ ] E2E / Visual (Playwright): ...
