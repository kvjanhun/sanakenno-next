# Sanakenno 2.0 — Project Map

High-level map of what exists in `sanakenno-next` and core domain invariants.

## Workspace Layout

```text
sanakenno-next/
  AGENTS.md                  # Agent-first operating rules & 1-Screen Curation Brief mandate
  OPEN_SOURCE_LICENSES.md    # Comprehensive open source & open data license attribution
  PROJECT_MAP.md             # Current architecture & domain invariants
  Dockerfile                 # Multi-stage production container (Node 22 Alpine, commit.txt stamp)
  docker-compose.yml         # Dual-instance zero-downtime services (sanakenno-a & sanakenno-b)
  scripts/
    create-admin.ts          # Admin credential provisioning CLI
    deploy-sanakenno.sh      # Server deployment & verification pipeline
    filter-kotus-wordlist.ts # Kotus dictionary filtering & hyphenated lemma extractor
    migrate-v1-db.ts         # Standalone 1.0 -> 2.0 SQLite snapshot & backfill migration CLI
    screenshot-targets.ts    # Desktop/mobile screenshot scenario targets & CDP action builders
    screenshot.ts            # Single-CDP headless Chrome screenshot runner with auto server boot
    verify-turso-parity.ts   # SQLite <-> Turso (libSQL) 18-table & data-invariant parity CLI
  .github/workflows/ci-web.yml# GitHub Actions CI & Cloud Run deploy workflow
  specs/                     # Sequenced specs driving autonomous implementation
    archive/                 # Shipped historical specs (superseded point-in-time slices)
  packages/
    shared/                  # @sanakenno/shared — Pure Finnish game logic (scoring, hint-data, stats, achievements, sync-merge, kotus lemma links, share-text, honeycomb-theme, auth-types) & Zod schemas
    server/                  # @sanakenno/server — Hono RPC API + Kysely SQLite layer + Cloud Run edge middleware
      src/
        edge-middleware.ts   # Canonical 302 host redirect (next/www -> sanakenno.fi), Google security headers, zero-DB MAINTENANCE_MODE app & PWA static serving
        lib/                 # Shared server utilities (@hono/zod-validator error hook helper)
        db/                  # 17-table Kysely Database<Schema>, dual SQLite (BEGIN IMMEDIATE) & repo-owned Turso/libSQL dialect (libsql-dialect.ts), sync/async 0001-0005 migration runners (async-migrations.ts), 1.0 backfill helper (backfill-stats.ts), deterministic seed
        features/
          health/            # System health & rotation headroom (GET /api/health)
          puzzle/            # Finnish wordlist engine, bounded 10-entry LRU cache, daily/slot puzzle RPC & single-query archive (GET /api/archive)
          player-auth/       # Passwordless player Bearer auth, session TTL, 15-min transfer tickets & 6-digit PIN pairing (POST /api/player/auth/transfer/ticket, /create, /use), Resend EU support, sliding-window rate limiters, active device count (GET /api/player/me)
          player-sync/       # Monotonic cross-device progress & preference sync (GET /api/player/sync, POST /api/player/sync/progress, POST /api/player/sync/preferences)
          telemetry/         # Hardened public gameplay telemetry with sliding-window rate limiters & wordlist validation (POST /api/achievement, /api/failed-guess, /api/word-find)
          admin-auth/        # Argon2id admin cookie session auth & CSRF guardrails (POST /api/auth/*)
          admin-puzzles/     # Puzzle CRUD, swap, center override, preview, blocked words & 14-day schedule (POST/GET/DELETE /api/admin/*)
          admin-suggestions/ # No-spoiler puzzle suggestion engine, curated pangram quality, combinations browser & rejections (GET/POST/DELETE /api/admin/*)
          admin-analytics/   # Achievement, failed-guess & per-puzzle word-find telemetry aggregations (GET /api/admin/*)
    web/                     # @sanakenno/web — React 19 + TanStack Query + Hono RPC client
      src/
        api/                 # Typed Hono RPC client (hc<AppType>), split into client.ts and admin-client.ts
        pwa.config.ts        # PWA manifest, service worker registration, Workbox runtime caching & vite:preloadError recovery
        features/
          gameplay/          # Core gameplay UI (Honeycomb, WordInput, RankProgress, FoundWords, HintPanels, AnnouncementBanner), announcements, gameplay-effects.ts, offline puzzle cache (storage.ts / usePuzzleQuery.ts), useMidnightRollover, and hybrid state
          modals/            # Statically bundled player modals (ModalShell, ArchiveModal, PuzzleWordsModal, StatsModal, RulesModal, SettingsModal) and PrivacySection (GDPR Art. 13 & localStorage disclosure)
          player-sync/       # Player auth store with debounced sync queue and keepalive, monotonic sync reconciliation, 6-digit PIN SyncModal, ConnectBanner
          theme/             # 6-palette CSS custom property theme system (usePaletteStore, useThemePreferenceStore, preference-sync, ThemeSelector, ThemeToggle)
          admin/             # Code-split admin panel (AdminLayout, LoginPage, PuzzleEditor, PuzzleSlotControls, VariationsGrid, WordList, AdminWordListPanel, ManualPuzzleForm, BlockedWords, Schedule, CombinationsBrowser, SuggestionPanel, SuggestionRejections, Stats, WordData, WordFinds, useAdminStore)
        styles/              # CSS custom property design tokens (--color-*, --font-*)
  tests/
    architecture.test.ts     # Mechanical boundary & monolith guardrails
    integration/             # In-memory Kysely SQLite + Hono testClient specs + edge middleware + production snapshot tests
    unit/                    # Fast Vitest + React Testing Library component & gameplay flow specs
```

---

## Core Domain Invariants (Preserved from Sanakenno 1.0)

### 1. Puzzle Numbering (`slot` vs `display_number`)

Two numbers identify a puzzle and are **never** interchangeable:

- **`slot`** (`puzzle_number` in storage/API): Permanent primary key. Soft-deleted puzzles keep their `slot` forever so `player_stats`, `player_puzzle_states`, `word_finds`, and `localStorage` keys stay valid. New puzzles append at `nextFreeSlot()`.
- **`display_number`**: 1-based index among _active_ (`is_active = 1`) puzzles. Soft-deleting a puzzle closes the gap. Cycle positions must always be derived from active slot indices, never slot arithmetic.

### 2. Timezone

Daily puzzle rotation strictly follows `Europe/Helsinki` midnight.

### 3. Production Runtime & Database Persistence

- Sanakenno runs on Google Cloud Run (`europe-north1`, `512Mi` RAM, `--max-instances 3`) backed by managed **Turso (libSQL)** in `aws-eu-north-1` (`kysely-libsql`), with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` injected via GCP Secret Manager.
- The production Docker container runs compiled ESM JavaScript directly via `node packages/server/dist/index.js` (compiled from `@sanakenno/shared` and `@sanakenno/server`). Local development and Vitest suites use `better-sqlite3` (`kysely-sqlite`) with zero Turso account requirement.
- Setting `MAINTENANCE_MODE=true` boots `createMaintenanceApp()` without opening any database (`200` on `/api/health`, `503` Finnish maintenance responses elsewhere).
- `SIGTERM` and `SIGINT` handlers in `packages/server/src/index.ts` close incoming HTTP traffic, run `PRAGMA wal_checkpoint(TRUNCATE)` on local SQLite, and destroy the Kysely pool cleanly before container termination.
- `GET /commit.txt` serves the stamped `./dist/commit.txt` SHA or `process.env.GIT_COMMIT` for deployment parity verification.

### 4. Language Convention

- All user-facing UI strings: **Finnish**.
- All code, identifiers, comments, specs, and tests: **English**.

### 5. Hyphen Normalization & Kotus Lemma Invariant

- Both hyphenated and un-hyphenated forms (`aamu-uninen` and `aamuuninen`) resolve to the identical normalized SHA-256 hash in gameplay.
- Kotus dictionary links and revealed word lists in `PuzzleWordsModal` always use canonical hyphenated lemmas.

### 6. Daily Streak Integrity & Milestone Separation

- **Milestones (`NoHintMilestone`):** Per-puzzle unassisted point markers (25%, 50%, 70%) on the progress bar.
- **Achievements (`ACHIEVEMENT_DEFINITIONS`):** Long-term player badges across 6 categories with 5 tiers each (Pronssi, Hopea, Kulta, Timantti, Mestari). `AnnouncementBanner` only announces unlocked achievement tiers (`achievement_unlocked`), letter-cleared callouts (`letter_cleared`), and 25%/50% unassisted milestones (`no_hint_milestone`)—never intermediate achievement progress nudges.
- **Streak ("Putki"):** Strictly measures consecutive calendar days in `Europe/Helsinki` on which the player solved words in the active daily puzzle. Archive plays never advance or create streaks.
