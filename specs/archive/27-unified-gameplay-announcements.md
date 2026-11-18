# Spec 27: Unified Gameplay Announcements

Status: shipped
Branch: spec/27-unified-gameplay-announcements
Reference: `packages/web/src/features/gameplay/AchievementNotification.tsx`, `packages/web/src/features/gameplay/MessageBar.tsx`, `packages/web/src/features/gameplay/GameplayView.tsx`, `packages/web/src/features/gameplay/gameplay-effects.ts`, `packages/web/src/features/gameplay/useUiStore.ts`

## 1. Objective

Consolidate non-pangram gameplay notifications (letter cleared, achievement unlocks and progress, and two-row unassisted milestones) into a single unified **`AnnouncementBanner`** ("Ilmoitus") anchored directly below `RankProgress`, while keeping immediate word-submission feedback (`+pts`, the `'Pangrammi!'` `special` chip, and validation errors like `"Kirjain 'A' puuttuu!"`) in `MessageBar` below `WordInput`. Provide a DevTools console helper (`window.sanakennoAnnounce`) so every announcement variant can be previewed and verified interactively.

## 2. Invariants & Non-Goals

### Invariants

1. **Clear Role & Terminology Separation:**
   - **Word Feedback (`MessageBar`, below `WordInput`):** Immediate word-submission feedback (`+pts` with `type: 'ok'`, the optional `'Pangrammi!'` secondary chip with `secondaryType: 'special'`, and rejections like `"Liian lyhyt!"`, `"Kirjain 'A' puuttuu!"`, `"Ei sanakirjassa"`, `"Löysit jo tämän!"`, `"Käytä vain annettuja kirjaimia!"` with `type: 'error'`).
   - **Gameplay Announcements (`AnnouncementBanner` / Finnish *"Ilmoitus"*, directly below `RankProgress`):** Unified single-slot announcement surface for letter-cleared, achievement unlock/progress, and unassisted milestone events.
2. **Zero Layout Shift:**
   - `AnnouncementBanner` renders inside the sticky `RankProgress` wrapper (`position: absolute; top: 100%; left: 0; right: 0; z-index: 30; marginTop: '0.35rem'`), floating cleanly above `HintPanels` without shifting `HintPanels`, `WordInput`, or `Honeycomb` regardless of whether hints are collapsed or expanded.
   - When `showRanks` is open, `AnnouncementBanner` suppresses or yields (`!showRanks`) so it never collides with the rank thresholds dropdown at the exact same `top: 100%` anchor.
3. **Single Active Slot (Sequential FIFO Queue):**
   - Only **one** announcement is visible at a time. When multiple announcements trigger from a single word submission (e.g., clearing a letter and unlocking an achievement), they queue in FIFO order and display sequentially after the active banner expires or is dismissed on click.
4. **Uniform "Sivuraita" Geometry with Distinct Achievement Styling & Zero Truncation:**
   - All announcements share identical **Sivuraita** (Option B) card geometry (`w-full rounded-xl px-3 py-2`, elevated surface `var(--color-bg-primary)`, `boxShadow: '0 4px 16px var(--color-button-shadow)'`, **4px solid left stripe**, 28×28 px left icon slot, center text block, optional right meta pill, smooth top slide-and-fade entrance, click-to-dismiss).
   - **Plain Gameplay Announcements (`kind: 'gameplay'`):** `4px solid var(--color-accent)` left stripe, `1px solid color-mix(in srgb, var(--color-accent) 42%, var(--color-border))` border, subtle accent tint (`color-mix(in srgb, var(--color-accent) 6%, var(--color-bg-primary))`), and rounded 28×28 px accent icon/letter badge.
   - **Achievement Announcements (`kind: 'achievement'`):** Styled with the semantic tier token (`var(--color-tier-bronze | silver | gold | diamond | master)`): `4px solid <tierToken>` left stripe, `1.5px solid` tier-tinted border, directional left-to-right tier gradient wash, subtle tier glow shadow, and **Hexagon Medallion** (`HexagonMedallion` + category `AchievementIcon`) in the left icon slot.
   - **Actual Achievement Titles & Explicit Two-Row Hierarchy:** Never invent category kickers (such as `"PÄIVÄPUTKI"`). Achievements put the actual `title` from `ACHIEVEMENT_DEFINITIONS` on row 1 and concise status (`"Uusi saavutus · 1 000 sanaa"` or `"Edistyminen · 6 / 7 päivää"`) on row 2, with a right-aligned Tier Pill (`Pronssi`, `Kohti: Pronssi`, etc.). Unassisted milestones (`no_hint_milestone`) likewise use explicit two-row text (`title: "Omin avuin"` / `"Avuitta taitava"`, `subtitle: "25 % pisteistä ilman apuja!"` / `"50 % pisteistä ilman apuja!"`, `metaPill: "25 %"` / `"50 %"`) instead of wrapping one long sentence.
   - **No Truncation:** Never apply `truncate`, `text-ellipsis`, or `whitespace-nowrap` to announcement titles or descriptions; allow clean natural wrapping (`leading-snug`) so nothing ever clips on narrow viewports (360px–390px).
5. **CSS Token & Monolith Compliance:**
   - All colors use CSS custom properties (`var(--color-*)`, `color-mix(...)`); zero hardcoded hex colors in `.tsx` files.
   - All user-facing copy in **Finnish**; code, identifiers, comments, and tests in **English**.
   - Every modified or created file strictly under 500 lines (`tests/architecture.test.ts`).

### Non-Goals

- Changing `MessageBar` placement or styling for `+pts`, `'Pangrammi!'`, and error rejections.
- Changing `Celebration` modal behavior at 70% unassisted (`Ällistyttävä ilman apuja!`) or 100% (`Täysi kenno!`).
- Adding persistent announcement history or notification centers.
- Modifying server APIs or database schemas.

## 3. Contract & Architecture

### 3.1 Announcement Data Model & Queue (`@sanakenno/web`)

Define a unified announcement union in `packages/web/src/features/gameplay/announcements.ts` and manage a sequential FIFO queue in `useUiStore`:

- **Types:**
  - `AnnouncementKind = 'gameplay' | 'achievement'`
  - `AnnouncementCategory = 'letter_cleared' | 'achievement_unlocked' | 'achievement_progress' | 'no_hint_milestone'`
  - `GameplayAnnouncement`:
    - `id: string` (unique per emission for animation keying & dismissal)
    - `kind: 'gameplay'`
    - `category: 'letter_cleared' | 'no_hint_milestone'`
    - `title: string` (e.g., `"Kaikki K-alkuiset sanat löydetty!"`, `"Avuitta taitava"`)
    - `subtitle?: string` (e.g., `"50 % pisteistä ilman apuja!"`)
    - `badgeText?: string` (e.g., `"K"` for letter cleared or `"50 %"` for milestone)
    - `metaPill?: string` (e.g., `"7/7"` or `"50 %"`)
    - `durationMs?: number` (defaults to `3200`)
  - `AchievementAnnouncement`:
    - `id: string`
    - `kind: 'achievement'`
    - `category: 'achievement_unlocked' | 'achievement_progress'`
    - `achievementId: AchievementId`
    - `title: string` (actual achievement title from `ACHIEVEMENT_DEFINITIONS`, e.g., `"Sanasampo"`, `"Päivittäinen tapa"`)
    - `subtitle: string` (e.g., `"Uusi saavutus · 1 000 sanaa"` or `"Edistyminen · 6 / 7 päivää"`)
    - `tierKey: AchievementTierKey`
    - `tierName: AchievementTierName`
    - `isUnlock: boolean`
    - `durationMs?: number` (defaults to `4500`)
  - `Announcement = GameplayAnnouncement | AchievementAnnouncement`

- **Store State (`useUiStore.ts`):**
  - Preserves `secondaryMessage` / `secondaryType` in `UiState` and `showToast(...)` for `'Pangrammi!'` (`'special'`) alongside `+pts`.
  - `activeAnnouncement: Announcement | null`
  - `announcementQueue: Announcement[]`
  - `enqueueAnnouncement: (announcement: Omit<Announcement, 'id'>) => void` (adds to queue or activates immediately if idle; auto-advances on timer expiry)
  - `dismissAnnouncement: () => void` (clears current timer and immediately promotes next queued announcement if any)
  - `resetUi()` clears active announcement, queue, and timer.

### 3.2 Announcement Triggers (`gameplay-effects.ts`)

1. **Pangram (`MessageBar` secondary chip):**
   - Keeps `ui.triggerPangramRipple()` and `ui.showToast(\`+\${pts}\`, 'ok', 2500, 'Pangrammi!', 'special')` in `MessageBar` right below `WordInput`.
2. **Letter Guessed Dry (`letter_cleared`):**
   - Fired when `foundWithLetter + 1 === totalForLetter` for `normalized[0]`.
   - Emits `kind: 'gameplay'`, `category: 'letter_cleared'`, `badgeText: firstLetter.toUpperCase()`, `title: "Kaikki ${L}-alkuiset sanat löydetty!"`, `metaPill: "${totalForLetter}/${totalForLetter}"`.
3. **Achievement Tier Unlocked (`achievement_unlocked`):**
   - Fired when `newProg.unlockedTier > oldTier && newProg.currentTier`.
   - Emits `kind: 'achievement'`, `category: 'achievement_unlocked'`, `title: newProg.title`, `subtitle: "Uusi saavutus · ${target}${unitSuffix}"`, `tierKey`, `tierName`. (Intermediate `achievement_progress` nudges were retired in `d5a1c0a` / Spec 33 so only actual tier unlocks trigger achievement banners.)
4. **Unassisted Milestone Reached (`no_hint_milestone`):**
   - Fired when `visibleHintsUnlocked.length === 0` and a word pushes `newScore` across the 25% (`"Omin avuin"`) or 50% (`"Avuitta taitava"`) `NO_HINT_MILESTONES` threshold for the first time in the puzzle (70% continues to show the `Celebration` dialog).
   - Uses two rows: `title: highestCrossed.name`, `subtitle: "${highestCrossed.pct} % pisteistä ilman apuja!"`, `metaPill: "${highestCrossed.pct} %"`.

### 3.3 UI Components (`@sanakenno/web`)

- **`AnnouncementBanner.tsx`:**
  - Replaces `AchievementNotification.tsx` (deleted).
  - Positioned inside the sticky `RankProgress` container in `GameplayView.tsx` (`position: absolute; top: 100%; left: 0; right: 0; z-index: 30; marginTop: '0.35rem'`), hidden when `showRanks` is true.
  - `role="status"`, `aria-live="polite"`, `data-testid="announcement-banner"`, `data-announcement-kind={announcement.kind}`, `data-announcement-category={announcement.category}`.
- **`MessageBar.tsx`:**
  - Renders `message` (`+pts` / error) plus optional `secondaryMessage` (`'Pangrammi!'` with `'special'` accent chip).
- **Console Test Command (`window.sanakennoAnnounce`):**
  - Attached on `window` in `AnnouncementBanner.tsx` (cleaned up on unmount) and documented in `announcements.ts`:
    - `window.sanakennoAnnounce('letter', 'K', 7)` — previews letter-cleared gameplay announcement.
    - `window.sanakennoAnnounce('achievement', 'total_words', 'gold')` — previews achievement unlock banner for any `AchievementId` and `AchievementTierKey`.
    - `window.sanakennoAnnounce('progress', 'streak', 6, 7, 'bronze')` — previews achievement progress announcement.
    - `window.sanakennoAnnounce('milestone', 50)` — previews two-row 25% or 50% unassisted milestone announcement.

## 4. Acceptance Criteria (Test Catalog)

- [x] **Unit / Store (`useUiStore` & `useGameStore`):**
  - Submitting `+pts` words populates `MessageBar` (`message: "+N"`, `messageType: "ok"`); pangrams also render `secondaryMessage: "Pangrammi!"`, `secondaryType: "special"` in `MessageBar`.
  - Submitting invalid words (`Liian lyhyt!`, `Kirjain 'X' puuttuu!`, `Ei sanakirjassa`) preserves exact `MessageBar` error chips.
  - Clearing the last word starting with a letter enqueues a `kind: 'gameplay'` (`letter_cleared`) announcement.
  - Crossing an achievement tier boundary enqueues a `kind: 'achievement'` (`achievement_unlocked`) announcement with correct tier key and target.
  - Crossing 25% / 50% unassisted milestones enqueues a two-row `no_hint_milestone` announcement (`title: "Omin avuin" / "Avuitta taitava"`, `subtitle: "25 % / 50 % pisteistä ilman apuja!"`).
  - Simultaneous triggers (e.g., letter cleared + achievement unlocked) queue FIFO and promote sequentially when dismissed or timed out.
- [x] **UI Component (`AnnouncementBanner.test.tsx` / `GameplayComponents.test.tsx`):**
  - Renders inside the `RankProgress` sticky container directly below the progress bar and never alters `HintPanels` or `Honeycomb` layout height.
  - Plain (`gameplay`) and achievement (`achievement`) announcements share **Sivuraita** banner geometry (4px left stripe) while rendering visually distinct tier colors, hexagon medallion, actual achievement title on line 1, status/progress on line 2, and tier badge.
  - Announcement title and subtitle lines never apply `truncate`, `text-ellipsis`, or `whitespace-nowrap`, and wrap cleanly on narrow mobile viewports without clipping.
  - Clicking the banner dismisses it immediately and promotes any queued item.
  - `window.sanakennoAnnounce(...)` triggers each announcement type cleanly in the live UI.
- [x] **Mechanical Gate & Visual Verification:**
  - `pnpm run check:agent` passes 100% (typecheck, lint, `tests/architecture.test.ts`, Vitest unit & integration, production build).
  - `pnpm run screenshot` captures mobile (390px) and desktop (1280px) views verifying both plain and achievement banners below `RankProgress` in light and dark themes.
