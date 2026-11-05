# Spec 21: Player Achievements & Daily Streak Integrity

Status: shipped
Branch: spec/21-player-achievements-and-streak-integrity
Reference: `packages/shared/src/scoring.ts`, `packages/shared/src/stats.ts`, `packages/web/src/features/modals/StatsModal.tsx`, `packages/web/src/features/gameplay/useGameStore.ts`

## 1. Objective

Introduce a comprehensive player achievement system ("Saavutukset") spanning daily streaks, cumulative words found, pangrams, word length milestones, full clears, and unassisted play, supported by a dedicated test suite across domain logic and UI. Concurrently, rename existing point-threshold "no-hint achievements" to "milestones" in an isolated preparatory step, and fix the daily streak calculation ("Putki" and "Pisin putki") so that archive puzzles cannot manufacture or advance streaks.

## 2. Invariants & Non-Goals

### Invariants
1. **Terminology Separation:**
   - **Milestones (`NoHintMilestone`, `NO_HINT_MILESTONES`):** The per-puzzle 25%, 50%, and 70% unassisted point markers displayed as pips on the rank progress bar.
   - **Achievements (`Achievement`, `ACHIEVEMENT_DEFINITIONS`):** Long-term, cross-game badges and unlockable rewards (streaks, total words, pangrams, full clears, etc.).
2. **Commit Isolation for Terminology Migration:**
   - The rename from `NO_HINT_ACHIEVEMENTS` / `NoHintAchievement` to `NO_HINT_MILESTONES` / `NoHintMilestone` must be completed as a clean, standalone first commit before the achievements feature code is added.
3. **Streak Integrity:**
   - A streak ("putki") strictly measures consecutive calendar days (`Europe/Helsinki` midnight) on which the player solved words in the active daily puzzle.
   - Playing historical archive puzzles (`viewingPuzzleDate !== null`) must **never** advance `current` streak or create/extend `best` streak.
   - Streaks only increment when the puzzle being played is the daily puzzle on that exact calendar day (`puzzle.date === getHelsinkiDateString()`).
   - The visible statistics ("Putki" and "Pisin putki") in `StatsModal` must reflect this corrected streak logic.
4. **Deterministic Achievement Evaluation:**
   - Achievements must be derived deterministically from existing monotonic player data (`records` in `PlayerStats`) combined with recorded daily play dates, ensuring historical progress is accurately credited upon feature release.
5. **Cross-Device Monotonicity:**
   - Achievement progress and unlock timestamps must merge monotonically across devices during sync without regress.
6. **Language Conventions:**
   - Finnish for all user-facing achievement titles, badge labels, and celebratory copy.
   - English for code identifiers, schemas, tests, and documentation.

### Non-Goals
- Real-time multiplayer leaderboards or competitive ranking against other players.
- Server-side anti-cheat verification for achievements (Sanakenno remains a private, client-friendly offline-first game).
- Modifying the existing admin telemetry `/api/achievement` endpoint (which remains for anonymous rank telemetry).

## 3. Contract & Architecture

### Phase 1: Preparatory Commit — Rename No-Hint Point Milestones
Before introducing the new achievements system, eliminate semantic collision by renaming the existing per-puzzle point-percentage markers in code:
- In `packages/shared/src/scoring.ts`:
  - `NoHintAchievement` → `NoHintMilestone`
  - `NoHintAchievementState` → `NoHintMilestoneState`
  - `NO_HINT_ACHIEVEMENTS` → `NO_HINT_MILESTONES`
  - `noHintAchievementStates` → `noHintMilestoneStates`
- In `packages/shared/src/stats.ts`:
  - Update imports and internal references to `NO_HINT_MILESTONES`.
- In `packages/web/src/features/gameplay/RankProgress.tsx`:
  - Prop and variable names: `noHintAchievements` → `noHintMilestones`.
- In `packages/web/src/features/modals/StatsModal.tsx`:
  - Update comments and milestone references.
- Tests updated to verify 100% mechanical pass (`pnpm check:agent`).
- Committed as an atomic change: `refactor(shared): rename point-threshold achievements to milestones`.

### Phase 2: Streak Calculation & Record Integrity Fix
1. **`StatsRecord` & `PlayerStats` enhancement in `@sanakenno/shared`:**
   - Add `is_daily?: boolean`, `played_at_date?: string`, and `long_words_count?: number` (count of words length >= 10) to `StatsRecord`.
   - When recording stats from the active daily puzzle (`useUiStore.getState().viewingPuzzleDate === null`), set `is_daily = true` and `played_at_date = getHelsinkiDateString()`.
   - When recording stats from an archive puzzle, set `is_daily = false`.
   - Count words with length >= 10 and record in `long_words_count`.
   - For backwards compatibility: existing records without `is_daily` are treated as daily only if their recorded `date` matches the puzzle's original scheduled date and was recorded on that date. Backfill `long_words_count` where saved puzzle state words are accessible.
2. **`computeStreak` overhaul:**
   - Filter records strictly to daily-eligible plays (`is_daily === true` or equivalent daily play dates).
   - `current`: Number of consecutive daily plays ending either today or yesterday in Helsinki time.
   - `best`: Longest sequence of consecutive calendar days of daily plays in player history. Playing archive puzzles will no longer artificially bump `best`.

### Phase 3: Player Achievement Catalog & Evaluation

| Category | ID | Finnish Title | Description | Target / Tiers |
|---|---|---|---|---|
| **Päiväputki** | `streak` | **Päivittäinen tapa** | Pelaa päivän kenno peräkkäisinä päivinä | 7 pv (Pronssi), 30 pv (Hopea), 60 pv (Kulta), 120 pv (Timantti), 365 pv (Mestari) |
| **Sanat** | `total_words` | **Sanasampo** | Löydä sanoja yhteensä kaikista kennoista | 100 (Pronssi), 500 (Hopea), 1 000 (Kulta), 2 500 (Timantti), 5 000 (Mestari) |
| **Pangrammit** | `pangrams` | **Taitava #7** | Löydä pangrammeja (kaikki 7 kirjainta sisältäviä sanoja) | 7 (Pronssi), 17 (Hopea), 77 (Kulta), 177 (Timantti), 777 (Mestari) |
| **Pitkät sanat** | `long_word` | **Sanahirviö** | Löydä pitkiä sanoja (>=10 kirjainta) | 5 (Pronssi), 20 (Hopea), 50 (Kulta), 100 (Timantti), 500 (Mestari) |
| **Täydet kennot** | `full_board` | **Täyteen, kiitos!** | Löydä kaikki sanat yhdestä kennosta (Täysi kenno) | 2 (Pronssi), 5 (Hopea), 10 (Kulta), 20 (Timantti), 50 (Mestari) |
| **Ilman apuja** | `unassisted_master` | **Omin siivin** | Saavuta Ällistyttävä-taso avaamatta yhtäkään vihjettä | 1 (Pronssi), 3 (Hopea), 8 (Kulta), 15 (Timantti), 25 (Mestari) |

- **Tier metadata:** Each tier has standard styling tokens (`bronze`, `silver`, `gold`, `diamond`, `master`), visual badge indicator, target number, and unlocked state.
- **Progress computation:** Pure function returning current metric count, unlocked tier index (0 to 5), next tier target, and percentage to next tier.

### Phase 4: UI & Visual Integration (`@sanakenno/web`)
1. **`StatsModal` Tab Navigation:**
   - Segmented control / tabs at top: **"Yhteenveto"** (existing game & word stats) vs **"Saavutukset"** (new badges & progress view).
   - Preserves all existing stats without vertical clutter.
2. **Achievements List / Grid:**
   - Visual cards showing achievement icon, Finnish title, description, progress bar (`X / Y`), tier badges, and completion highlight.
3. **In-Game Unlock Notification:**
   - Non-intrusive bottom toast/banner when an achievement tier is unlocked during play (e.g. *"🏆 Uusi saavutus: Sanasampo (Pronssi — 100 sanaa)!"*), auto-dismissing after 4 seconds.

### Module Contracts

- **`@sanakenno/shared`**:
  - `src/scoring.ts`:
    - Rename `NoHintAchievement*` to `NoHintMilestone*`.
  - `src/achievements.ts`:
    - `ACHIEVEMENT_DEFINITIONS`: Array of achievement definitions with 5-tier targets.
    - `evaluateAchievements(stats: PlayerStats, streak: { current: number; best: number }): PlayerAchievementProgress[]`
  - `src/stats.ts`:
    - Updated `computeStreak` rejecting archive puzzles.
    - Updated `updateStatsRecord` and `StatsRecord` interface (`is_daily?: boolean`, `played_at_date?: string`, `long_words_count?: number`).
- **`@sanakenno/web`**:
  - `src/features/modals/StatsModal.tsx`:
    - Tab toggle between "Yhteenveto" and "Saavutukset".
    - `AchievementsList` subcomponent rendering tiered achievement progress cards.
    - Corrected "Putki" and "Pisin putki" rendering.
  - `src/features/gameplay/useGameStore.ts`:
    - Flag daily vs archive plays when calling `recordLocalStatsUpdate`.
    - Check for newly unlocked achievements after valid word submission and trigger notification banner.
  - `src/features/gameplay/AchievementNotification.tsx`:
    - Compact, elegant toast for live unlocks.

## 4. Acceptance Criteria

A dedicated, comprehensive test suite must be implemented covering domain logic, edge cases, store integration, and UI rendering:

### A. Shared Domain Test Suite (`packages/shared/tests/`)
1. **`tests/milestones.test.ts` (Phase 1):**
   - [ ] Verifies `NO_HINT_MILESTONES` exports 25%, 50%, and 70% tiers.
   - [ ] Verifies `noHintMilestoneStates` calculates unlock flags correctly based on score thresholds.
2. **`tests/streak.test.ts` (Phase 2):**
   - [ ] **Daily Streak Progression:** Consecutive daily puzzles played on consecutive calendar days increments `current` and updates `best`.
   - [ ] **Gap Day Reset:** Missing a calendar day resets `current` to 0 or 1 on resumption, preserving historical `best`.
   - [ ] **Archive Isolation:** Playing archive puzzles (from 1 month ago, 1 week ago, or yesterday via the archive) does **not** increment `current` streak.
   - [ ] **Archive Cluster Isolation:** Playing multiple consecutive archive dates in a single session does **not** inflate `best` streak.
   - [ ] **Today's Helsinki Date Boundary:** Only puzzles solved on the active Helsinki date are flagged `is_daily: true`.
3. **`tests/achievements.test.ts` (Phase 3):**
   - [ ] **Catalog Completeness:** Verifies all 6 categories (`streak`, `total_words`, `pangrams`, `long_word`, `full_board`, `unassisted_master`) are defined with exactly 5 tiers each (Pronssi, Hopea, Kulta, Timantti, Mestari).
   - [ ] **Streak Achievement:** Evaluates tiers at 7, 30, 60, 120, and 365 days using streak calculations.
   - [ ] **Total Words Achievement:** Evaluates tiers at 100, 500, 1 000, 2 500, and 5 000 cumulative words across all records.
   - [ ] **Pangrams Achievement ("Taitava #7"):** Evaluates tiers at 7, 17, 77, 177, and 777 cumulative pangrams.
   - [ ] **Long Words Achievement ("Sanahirviö"):** Evaluates tiers at 5, 20, 50, 100, and 500 words of length >= 10.
   - [ ] **Full Board Achievement ("Täyteen, kiitos!"):** Evaluates tiers at 2, 5, 10, 20, and 50 puzzles where `words_found === total_words` / `best_score === max_score` ("Täysi kenno").
   - [ ] **Unassisted Achievement ("Omin siivin"):** Evaluates tiers at 1, 3, 8, 15, and 25 puzzles reaching "Ällistyttävä" without hints.
   - [ ] **Boundary & Zero States:** Empty stats record returns tier 0 with 0% progress toward Pronssi; exact boundary numbers unlock the respective tier immediately.
   - [ ] **Monotonicity:** Evaluation never downgrades a tier even if later sessions have lower scores.

### B. Web Integration & Store Test Suite (`packages/web/src/features/`)
1. **`useGameStore.achievements.test.ts`:**
   - [ ] Playing the daily puzzle updates `is_daily = true` and recalculates streak.
   - [ ] Playing an archive puzzle updates `is_daily = false`, adds to lifetime word/pangram totals, but does not affect streak.
   - [ ] Finding a 10-letter word increments `long_words_count` in the puzzle stats record.
   - [ ] Submitting a word that crosses an achievement tier boundary triggers the `newAchievement` toast notification with correct title and tier.
   - [ ] Subsequent word submissions that do not cross a tier boundary do not trigger duplicate notifications.
2. **`StatsModal.achievements.test.tsx`:**
   - [ ] Renders the "Yhteenveto" and "Saavutukset" tab buttons.
   - [ ] Clicking "Saavutukset" switches view and lists all 6 achievement cards with Finnish titles and descriptions.
   - [ ] Displays progress bars, tier badge indicators (Pronssi/Hopea/Kulta/Timantti/Mestari), and completion states.
   - [ ] In "Yhteenveto", "Putki" and "Pisin putki" display correct values derived from streak logic.

### C. Visual Inspection & Build Fitness
- [ ] `pnpm run check:agent` passes 100% (TypeScript, ESLint, architecture rules, tests).
- [ ] Visual Inspection (`pnpm run screenshot`): Mobile (390px) and desktop (1280px) screenshots captured and visually verified for `StatsModal` tabs in light and dark themes.
