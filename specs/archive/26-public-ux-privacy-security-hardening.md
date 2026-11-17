# Spec 26: Public UX, Privacy Hardening & Security Guardrails

Status: shipped
Branch: spec/26-public-ux-privacy-security-hardening

## 1. Objective

Harden the public-facing application across performance, privacy compliance, and security:
- **Performance:** Code-split public modals (`ArchiveModal`, `StatsModal`, `SettingsModal`, `RulesModal`, `SyncModal`, `PuzzleWordsModal`) using `React.lazy()` to trim initial bundle size below the 500 kB chunk threshold.
- **Reliable Sync:** Replace per-word immediate server sync with a puzzle-keyed, debounced synchronization manager in `useAuthStore` equipped with `keepalive: true` and multi-event flush guarantees (`visibilitychange`, `pagehide`, `beforeunload`, puzzle switch, modal open, and milestone completion).
- **Clean Store Architecture:** Enforce a strict one-way store dependency (`useGameStore` → `gameplay-effects.ts` → `useUiStore` / `useAuthStore`) by extracting post-submission side effects out of `useGameStore.ts` without introducing a pub-sub bus or breaking existing unit tests.
- **Privacy Compliance (GDPR Art. 13):** Add a dedicated `PrivacySection.tsx` component inside `SettingsModal` explaining Resend 30-day transit logs and `localStorage` usage, update email footer disclosures in `send-transfer-link.ts`, and support `RESEND_API_URL` for Resend EU (`https://api.eu.resend.com`).
- **Expiring Transfer Tickets:** Replace sharing the permanent 64-hex `player_key` across code, link (`/?connect=<ticket>`), and email sharing with 15-minute, single-use transfer tickets (`player_transfer_tickets`) and human-readable 6-digit pairing codes (`XXX-XXX`), while keeping backward compatibility for legacy 64-hex keys.
- **Rate-Limiter Repair:** Replace perpetual in-memory counters with sliding-window rate limiters with automatic TTL eviction, keyed primarily by player session Bearer token (with outer IP fallback) to prevent permanent lockouts and mobile carrier CGNAT starvation.
- **Telemetry Hardening:** Validate `/api/word-find` against the puzzle's wordlist and enforce structural puzzle invariants on `/api/failed-guess` (length 4–20, contains center letter, uses only the puzzle's 7 letters, valid non-future date) to block spam and accidental PII leakage while preserving archive play telemetry.

## 2. Invariants & Non-Goals

### Core Invariants
- **Offline-First Zero-Data-Loss Invariant:** Local storage persistence (`sanakenno_state_<slot>` and `sanakenno_stats`) remains strictly synchronous and immediate on every keystroke/guess. Debouncing applies *only* to remote server synchronization.
- **Zero-Flicker Layout Invariant:** Lazy-loaded modals must mount inside `<Suspense fallback={null}>` without layout shift (CLS) or visual flicker. The core honeycomb and game view render synchronously.
- **No Cookie Banner Invariant:** All browser storage continues to serve strictly necessary technical purposes under the ePrivacy Directive and Finnish Traficom guidelines. No tracking or marketing scripts are introduced.
- **Mobile CGNAT Protection Invariant:** Rate limiting buckets primarily by validated/hashed player Bearer token when present and falls back to a higher IP ceiling, preventing carrier-level lockout on Finnish mobile networks (DNA, Elisa, Telia).
- **Archive & Dictionary Gap Analytics Invariant:** Failed guesses on both daily and past archive puzzles (`date <= getHelsinkiDateString()`) continue to be recorded for Kotus dictionary gap analysis whenever they conform to the puzzle's 7-letter + center-letter rules.
- **500-Line Monolith Ceiling Invariant:** Files approaching 500 lines (`baseline-sql.ts`, `GameplayView.tsx`, `useGameStore.ts`, `SettingsModal.tsx`, `SyncModal.tsx`) must extract helper modules (`backfill-stats.ts`, `gameplay-effects.ts`, `PrivacySection.tsx`) so every file stays comfortably below 500 lines.

### Non-Goals
- Migrating away from Resend immediately (traffic is low; existing integration remains, with configurable `RESEND_API_URL` for EU endpoint compatibility).
- Adding third-party consent banner libraries or analytics SDKs.
- Introducing a pub-sub event bus in `@sanakenno/shared` or altering core scoring/hint rules.

### Collateral Effects & Risk Mitigations
| Risk / Collateral Effect | Root Cause | Architectural Mitigation |
| :--- | :--- | :--- |
| **Aborted sync on tab close or overwrite on puzzle switch** | Browser cancels in-flight `fetch()` on unload; switching to Archive puzzle within 1.5s could clobber a single pending payload. | Pass `keepalive: true` on `postSyncProgress`. Store pending payloads in a `Map<number, SyncProgressPayload>` keyed by `puzzle_number`, and call `flushPendingSync()` on `visibilitychange` (`hidden`), `pagehide`, `beforeunload`, and inside `useGameStore.loadPuzzle()`. |
| **500-line ceiling failures (`tests/architecture.test.ts`)** | `baseline-sql.ts` (457L), `GameplayView.tsx` (456L), `useGameStore.ts` (450L), `SyncModal.tsx` (425L), and `SettingsModal.tsx` (416L) are near the limit. | Extract `backfillPlayerStatsInDb` to `packages/server/src/db/backfill-stats.ts`, extract post-word-find effects to `gameplay-effects.ts`, and extract privacy disclosure UI to `PrivacySection.tsx`. |
| **Flicker when opening modals** | `React.lazy()` triggers Suspense fallback. | Wrap modal mounts in `<Suspense fallback={null}>` so lazy resolution is invisible and causes zero CLS. |
| **Legitimate mobile players throttled (CGNAT)** | Hundreds of Finnish mobile users share one public IPv4. | Attach optional `Authorization: Bearer <token>` header in `client.ts` for telemetry calls (`postWordFind`, `postFailedGuess`, `postAchievement`); rate-limit per session token first with a generous outer IP ceiling. |
| **Breaking archive play or existing telemetry tests** | Rejecting non-today dates in `/api/failed-guess` or unvalidated test fixtures in `telemetry.test.ts`. | Allow any valid ISO date `date <= getHelsinkiDateString()`, resolve the puzzle for `date` via `getFullPuzzleForDate(db, date)`, and update `tests/integration/telemetry.test.ts` slot-1 word-find fixture from `'kenno'` to `'kana'` (plus a negative test for `'kenno'`). |
| **Breaking legacy transfer links or tests** | Switching from `player_key` to short-lived transfer tickets. | Keep URL param as `/?connect=<ticket>` and support dual acceptance in `POST /api/player/auth/transfer/use`: resolve 15-minute tickets/codes first, falling back to legacy 64-hex `player_key` lookup. |

## 3. Contract & Architecture

### A. Shared Domain (`@sanakenno/shared`)
- **Transfer Ticket Schemas (`packages/shared/src/schemas/player-sync.ts`):**
  - `TransferTicketResponseSchema`: `{ ticket: z.string(), code: z.string(), expires_at: z.string() }`.
  - Keep `TransferUsePayloadSchema` accepting `token: z.string().min(1)` (which may be a 32-hex ticket, a 6-digit `XXX-XXX` / `XXXXXX` code, or a legacy 64-hex `player_key`).

### B. Database & Server (`@sanakenno/server`)
- **Schema & Migration (`packages/server/src/db/schema.ts`, `baseline-sql.ts`, `backfill-stats.ts`):**
  - Extract `backfillPlayerStatsInDb` from `baseline-sql.ts` into `packages/server/src/db/backfill-stats.ts` (re-exporting from `baseline-sql.ts` so existing callers remain untouched).
  - Add `PlayerTransferTicketsTable` to `schema.ts` and `player_transfer_tickets` DDL to `BASELINE_SQL` and `MIGRATIONS` (`version: '0005-add-player-transfer-tickets'`):
    ```sql
    CREATE TABLE IF NOT EXISTS player_transfer_tickets (
      id         TEXT PRIMARY KEY,
      player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      code       TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at    TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transfer_tickets_code ON player_transfer_tickets(code);
    CREATE INDEX IF NOT EXISTS idx_transfer_tickets_expires ON player_transfer_tickets(expires_at);
    ```
- **Sliding-Window Rate Limiter (`packages/server/src/features/player-auth/rate-limiter.ts`):**
  - Implement `SlidingWindowRateLimiter` tracking `{ count: number, windowStartMs: number }` per key with configurable `windowMs` and `maxRequests`.
  - Automatically prune expired entries on access and via a periodic cleanup threshold so Maps never grow unbounded.
  - Provide helper `getRateLimitKey(c)` that keys by `token:<sha256(bearerToken)>` when a Bearer header is present, or `ip:<clientIp>` otherwise.
- **Player Auth Routes & Email (`player-auth.routes.ts`, `player-auth.queries.ts`, `send-transfer-link.ts`):**
  - `POST /api/player/auth/transfer/ticket` (authenticated via `requirePlayerAuth`): Mints a 15-minute ticket (`id`: 32-hex URL token, `code`: 6-digit numeric code formatted `XXX-XXX`, `expires_at`: ISO timestamp) in `player_transfer_tickets` after cleaning up expired tickets.
  - `POST /api/player/auth/transfer/email` & `/create`: Mints a 15-minute ticket for `player.playerId` and emails `${baseUrl}/?connect=${ticket.id}` via `sendTransferLink`. (`player_key` in request body becomes optional for backward compatibility; if provided, still validated).
  - Update `send-transfer-link.ts`:
    - Read `process.env.RESEND_API_URL || 'https://api.resend.com'` so EU endpoint (`https://api.eu.resend.com`) can be configured via environment variable.
    - Update email copy to state that the link is single-use and valid for 15 minutes (*"Linkki on kertakäyttöinen ja voimassa 15 minuuttia"*), and clarify in the footer that the email address is not stored in Sanakenno's database while the email provider retains delivery logs for 30 days.
  - `POST /api/player/auth/transfer/use`:
    - Normalize incoming `token`.
    - First check `player_transfer_tickets` by `id = token` or `code = normalizedCode`. If found: verify `used_at IS NULL` and `expires_at > now` (return `400` with clear Finnish error if expired or already used), mark `used_at = datetime('now')`, and resolve `player_id`.
    - If not found in tickets, fall back to `getPlayerByKeyHash(db, hashPlayerKey(token))` for legacy 64-hex `player_key` compatibility.
- **Telemetry Hardening (`telemetry.routes.ts`, `telemetry.queries.ts`):**
  - Replace perpetual `Map<string, number>` counters with `SlidingWindowRateLimiter` (5-minute window: 60 word-finds, 30 failed guesses, 10 achievements per session/IP key).
  - In `POST /api/word-find`: Resolve puzzle via `getFullPuzzleBySlot(db, puzzle_number)`; verify `normalized` word is in `puzzle.words` before calling `upsertWordFind`. Return `400` if puzzle is missing or word is not a valid solution word for that puzzle.
  - In `POST /api/failed-guess`: Validate `date` is a valid ISO calendar date and `date <= getHelsinkiDateString()`. Resolve puzzle via `getFullPuzzleForDate(db, date)`. Verify `normalized` word has length 4–20, includes `puzzle.center`, uses only letters in `puzzle.letters`, and is not already a valid solution word. Return `400` otherwise.

### C. Web Frontend (`@sanakenno/web`)
- **Code-Splitting Modals (`GameplayView.tsx`):**
  - Convert `ArchiveModal`, `StatsModal`, `SettingsModal`, `RulesModal`, `SyncModal`, and `PuzzleWordsModal` imports to `React.lazy()`.
  - Wrap modal elements in `<Suspense fallback={null}>`.
- **Decoupled Gameplay Side Effects (`gameplay-effects.ts` & `useGameStore.ts`):**
  - Extract post-word-acceptance side effects (toast messages, pangram ripple, rank-up celebration, achievement badge check, `postWordFind`, `postAchievement`, and `useAuthStore.getState().syncProgressDebounced`) from `useGameStore.ts` into `packages/web/src/features/gameplay/gameplay-effects.ts`.
  - `useUiStore` remains a pure leaf store with zero imports from `useGameStore`.
- **Debounced Sync Manager (`useAuthStore.ts` & `client.ts`):**
  - In `packages/web/src/api/client.ts`:
    - Add `keepalive: true` to `postSyncProgress`.
    - Attach optional `Authorization: Bearer <token>` (read from `localStorage` `sanakenno_auth_token`) to `postAchievement`, `postFailedGuess`, and `postWordFind`.
    - Add `postPlayerTransferTicket(token)` calling `POST /api/player/auth/transfer/ticket`.
  - In `useAuthStore.ts`:
    - Add `syncProgressDebounced(payload)` backed by a `Map<number, SyncProgressPayload>` keyed by `puzzle_number` and a 1.5-second trailing timer.
    - Expose `flushPendingSync(): Promise<void>` which immediately sends and clears all pending payloads (retaining any payload in the map if the network request rejects so offline play retries on next sync/reconnect).
    - Flush immediately when rank reaches `Ällistyttävä` or `Täysi kenno`, inside `useGameStore.loadPuzzle()` before switching puzzles, when opening `SyncModal` or `StatsModal`, and on `visibilitychange` (`hidden`), `pagehide`, and `beforeunload`.
- **Privacy Notice (`PrivacySection.tsx` & `SettingsModal.tsx`):**
  - Create `packages/web/src/features/modals/PrivacySection.tsx` rendered as a collapsible "Tietosuoja" toggle in `SettingsModal.tsx` alongside "Lisenssit":
    - Controller details (*Rekisterinpitäjä*).
    - Email processing via Resend strictly for requested transfer links, with 30-day delivery log retention at the email processor.
    - Essential `localStorage` usage (`sanakenno_state_*`, `sanakenno_stats`, theme, session token) and confirmation of zero third-party tracking cookies.
    - Player rights (erasure via device data reset and contact info).
- **Expiring Ticket & Pairing Code UI (`SyncModal.tsx`):**
  - When `SyncModal` opens, request a 15-minute transfer ticket via `useAuthStore.getState().requestTransferTicket()` (with fallback to `playerKey` in offline/test environments).
  - Display the human-friendly 6-digit pairing code (`XXX-XXX`) and 15-minute validity note for "Kopioi koodi" and "Kopioi linkki" (`/?connect=<ticket>`).
  - Allow entering either a 6-digit pairing code (with or without hyphen) or a full transfer key in "Yhdistä toinen laite".

## 4. Acceptance Criteria (Test Catalog)

### Unit & Domain Tests (`packages/shared`, `packages/server`)
- [ ] **Rate Limiter Sliding Window & Eviction:** `SlidingWindowRateLimiter` allows up to `maxRequests` within `windowMs`, rejects with `429` when exceeded, resets cleanly after `windowMs` elapses, and evicts stale keys during cleanup.
- [ ] **Transfer Ticket Lifecycle:** Creating a ticket generates a 32-hex `ticket` and `XXX-XXX` 6-digit `code` valid for 15 minutes; redeeming within 15 minutes succeeds; redeeming a second time or after 15 minutes returns `400`.

### Integration Tests (`tests/integration/`)
- [ ] **Word-Find Telemetry Validation:** `POST /api/word-find` records valid puzzle words (e.g. `'kana'` for slot 1) and rejects words not in the puzzle's wordlist (e.g. `'kenno'` for slot 1) with `400`.
- [ ] **Failed-Guess Structural & Archive Validation:** `POST /api/failed-guess` accepts non-dictionary words matching the puzzle's 7 letters and center letter on both today's date and past archive dates (`2026-04-10`), and rejects words missing the center letter, containing invalid letters, or targeting future dates with `400`.
- [ ] **Transfer Flow via Ticket, 6-Digit Code & Legacy Key:** Device A creates a transfer ticket; Device B pairs using the 6-digit `code` (or `ticket` id); legacy 64-hex `player_key` transfer continues to pass.

### UI & Store Tests (`tests/unit/`, Vitest + RTL)
- [ ] **Debounced Sync & Flush Guarantees:** Rapid word submissions coalesce into a single `postSyncProgress` call after 1.5s; firing `visibilitychange` (`hidden`) or switching puzzles flushes pending sync immediately.
- [ ] **Modal Lazy Loading & Privacy Section:** Opening `SettingsModal`, `ArchiveModal`, and `StatsModal` resolves lazily via `Suspense`; clicking "Tietosuoja" in `SettingsModal` reveals the GDPR Art. 13 and `localStorage` disclosures.
- [ ] **Pairing Code UI:** `SyncModal` displays the expiring pairing code and supports connecting with a 6-digit code.

### Build & Mechanical Verification
- [ ] **Bundle Size Reduction:** Production build main JS chunk drops below the 500 kB Vite warning ceiling.
- [ ] **Mechanical Gate:** `pnpm run check:agent` passes 100% (TypeScript, ESLint/Prettier, `tests/architecture.test.ts`, Vitest unit + integration, and production build).
- [ ] **Visual Verification:** `pnpm run screenshot` inspected for mobile (390px) and desktop (1280px).
