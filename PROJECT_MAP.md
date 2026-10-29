# Sanakenno 2.0 — Project Map

High-level map of what exists in `sanakenno-next` and core domain invariants.

## Workspace Layout

```text
sanakenno-next/
  AGENTS.md                  # Agent-first operating rules & 1-Screen Curation Brief mandate
  PROJECT_MAP.md             # Current architecture & domain invariants
  Dockerfile                 # Multi-stage production container (Node 22 Alpine, commit.txt stamp)
  docker-compose.yml         # Dual-instance zero-downtime services (sanakenno-a & sanakenno-b)
  scripts/deploy-sanakenno.sh# Server deployment & verification pipeline
  .github/workflows/ci-web.yml# GitHub Actions CI & webhook deploy workflow
  specs/                     # Sequenced specs driving autonomous implementation
  packages/
    shared/                  # @sanakenno/shared — Pure Finnish game logic (scoring, hint-data, stats, sync-merge, kotus, share-text, honeycomb-theme, auth-types) & Zod schemas
    server/                  # @sanakenno/server — Hono RPC API + Kysely SQLite layer
      src/
        db/                  # 16-table Kysely Database<Schema>, BEGIN IMMEDIATE driver, 0001-0002 migration runner, deterministic seed
        features/
          health/            # System health & rotation headroom (GET /api/health)
          puzzle/            # Finnish wordlist engine, bounded 10-entry LRU cache, daily/slot puzzle RPC & single-query archive (GET /api/archive)
          player-auth/       # Passwordless player Bearer auth, session TTL, pairing-code email delivery (POST /api/player/auth/*)
          player-sync/       # Monotonic cross-device progress sync (GET /api/player/sync, POST /api/player/sync/*)
          telemetry/         # Public gameplay telemetry (POST /api/achievement, /api/failed-guess, /api/word-find)
          admin-auth/        # Argon2id admin cookie session auth & CSRF guardrails (POST /api/auth/*)
          admin-puzzles/     # Puzzle CRUD, swap, center override, preview, blocked words & 14-day schedule (POST/GET/DELETE /api/admin/*)
          admin-suggestions/ # No-spoiler puzzle suggestion engine, curated pangram quality, combinations browser & rejections (GET/POST/DELETE /api/admin/*)
          admin-analytics/   # Achievement, failed-guess & per-puzzle word-find telemetry aggregations (GET /api/admin/*)
    web/                     # @sanakenno/web — React 19 + TanStack Query + Hono RPC client
      src/
        api/                 # Typed Hono RPC client (hc<AppType>)
        pwa.config.ts        # PWA manifest, service worker registration & Workbox runtime caching
        features/
          gameplay/          # Core gameplay UI (Honeycomb, WordInput, RankProgress, FoundWords, HintPanels), useMidnightRollover, and hybrid state
          modals/            # ArchiveModal, PuzzleWordsModal, StatsModal, RulesModal, SettingsModal
          player-sync/       # Player auth store, monotonic sync reconciliation, SyncModal, ConnectBanner
          theme/             # 6-palette CSS custom property theme system (usePaletteStore, useThemePreferenceStore, ThemeSelector, ThemeToggle)
          admin/             # Code-split admin panel (AdminLayout, LoginPage, PuzzleEditor, PuzzleSlotControls, VariationsGrid, WordList, AdminWordListPanel, ManualPuzzleForm, BlockedWords, Schedule, CombinationsBrowser, SuggestionPanel, SuggestionRejections, Stats, WordData, WordFinds, useAdminStore)
        styles/              # CSS custom property design tokens (--color-*, --font-*)
  tests/
    architecture.test.ts     # Mechanical boundary & monolith guardrails
    integration/             # In-memory Kysely SQLite + Hono testClient specs + production snapshot tests
    e2e/                     # Ephemeral Playwright specs (gameplay, modals, admin, pwa)
```

---

## Core Domain Invariants (Preserved from Sanakenno 1.0)

### 1. Puzzle Numbering (`slot` vs `display_number`)

Two numbers identify a puzzle and are **never** interchangeable:

- **`slot`** (`puzzle_number` in storage/API): Permanent primary key. Soft-deleted puzzles keep their `slot` forever so `player_stats`, `player_puzzle_states`, `word_finds`, and `localStorage` keys stay valid. New puzzles append at `nextFreeSlot()`.
- **`display_number`**: 1-based index among _active_ (`is_active = 1`) puzzles. Soft-deleting a puzzle closes the gap. Cycle positions must always be derived from active slot indices, never slot arithmetic.

### 2. Timezone

Daily puzzle rotation strictly follows `Europe/Helsinki` midnight.

### 3. Production Swaps & Database Persistence

- Persistent volume mount `/data/sanakenno.db` preserves SQLite database state across restarts and enables continuous Litestream replication to Backblaze B2.
- Dual-container configuration (`sanakenno-a` and `sanakenno-b`) on host ports 8081/8082 with Nginx upstream proxy enables zero-downtime hot swapping.
- `commit.txt` stamping into `./dist/commit.txt` verifies end-to-end deployment parity.

### 4. Language Convention

- All user-facing UI strings: **Finnish**.
- All code, identifiers, comments, specs, and tests: **English**.
