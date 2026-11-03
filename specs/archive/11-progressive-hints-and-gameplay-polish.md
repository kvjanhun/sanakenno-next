# Spec 11: Progressive Hints & Gameplay Polish

Status: shipped
Branch: spec/11-progressive-hints-and-gameplay-polish
Reference (1.0): /Users/erezac/Projects/sanakenno/packages/web/src/components/HintPanels.tsx

## 1. Objective

Replace the legacy 3-tab hint panels (Yleiskuva, Pituudet, Alkuparit) with a unified, progressive 4-tier hint deck (Alkukirjaimet, Pangrammi-vihje, 2D Matriisi, Sananpäätteet) in a strictly fixed-height zone that guarantees zero board shift. Elevate gameplay with progress-bar embedded "Avuitta"-milestones, letter-cleared micro-celebrations, a honeycomb pangram ripple, smooth shuffle rotation, and desktop Space-key shuffle.

## 2. Invariants & Non-Goals

### Invariants
- **Fixed-Position Grid:** The Honeycomb letter grid must never shift its vertical position when hints are opened, upgraded, or closed.
- **Zero Scroll on Standard Mobile:** Header, score bar, hint zone, word input, honeycomb, game controls, and collapsed found words must fit entirely in the viewport without vertical scrolling on standard screens (>=667px height).
- **Anti-AI Slop Styling:** No decorative card wrappers, nested borders, or gratuitous pill containers. Use clean typography, white space, and CSS custom property design tokens.
- **Finnish Spelling:** "Avuitta taitava" (replaces legacy typo "Apuitta taitava").
- **Language Convention:** User-facing strings in Finnish; code, tests, and comments in English.
- **Monolith Ceiling:** Every file strictly <500 lines (enforced by `tests/architecture.test.ts`).

### Non-Goals
- No changes to base puzzle scoring or dictionary rules.
- No letter-filtering sub-navigation in the found words tray (kept clean and simple).
- No floating cards or modals for gameplay hints; hints live inline in the dedicated fixed-height zone.

## 3. Contract & Architecture

### 3.1 Shared Domain (`@sanakenno/shared`)
- **`hint-data.ts`**:
  - Extend `HintData` and `DerivedHintData` to include:
    - `matrix`: Record of `Record<string, number>` mapping `firstLetter -> (lengthStr -> count)`.
    - `pangram_details`: Array of `{ length: number; first_letter: string }` for all puzzle pangrams.
    - `suffixes`: Record of `Record<string, number>` mapping Finnish suffix strings (e.g. `-inen`, `-ton/-tön`, `-kas/-käs`, `-kko/-kkö`, `-sto/-stö`, `-sti`, `-lla/-llä`, `-tta/-ttä`, `-va/-vä`) to word counts.
  - Suffix catalog constant: `FINNISH_SUFFIXES = ['-inen', '-ton', '-tön', '-kas', '-käs', '-kko', '-kkö', '-sto', '-stö', '-sti', '-lla', '-llä', '-tta', '-ttä', '-va', '-vä', '-nut', '-nyt', '-tu', '-ty', '-llinen', '-lainen', '-läinen']`. Calculate from the actual suffixes that exist in the word list, not just all suffixes that exist.
  - Update `deriveHintData` to compute:
    - `letterMap`: remaining words per starting letter with `isComplete: boolean`.
    - `matrix`: letter x length breakdown with found counts subtracted.
    - `pangramStats`: unfound pangrams with length and first letter.
    - `suffixStats`: remaining words per matched suffix with found counts subtracted.
- **`scoring.ts`**:
  - Update `NO_HINT_ACHIEVEMENTS` to use `Avuitta taitava` (was `Apuitta taitava`).

### 3.2 Server Engine (`@sanakenno/server`)
- **`wordlist.ts`**:
  - In `computePuzzle`, compute `by_matrix`, `pangram_details`, and `by_suffix` from the solution words list.
  - Cache and serialize alongside existing `by_letter`, `by_length`, `by_pair`.

### 3.3 Web Gameplay Slice (`@sanakenno/web`)
- **`HintDeck.tsx`** (replaces legacy `HintPanels.tsx`):
  - Fixed height (~96 px) layout anchor.
  - **Tier 0:** "Pelaat omin avuin" text + "Ota vihjeet käyttöön (Taso 1)" button.
  - **Tier 1 (Alkukirjaimet):** Horizontal letter row with remaining counts (`K: 8`). Cleared letters show `✓`. Upgrade CTA: `Taso 2 (Pangrammi) →`.
  - **Tier 2 (Pangrammi-paljastus):** Tier 1 letters + unfound pangram clue (`Pangrammi: K... · 8 kirjainta`). Upgrade CTA: `Taso 3 (Matriisi) →`.
  - **Tier 3 (Matriisi):** Letter x Length 2D grid replacing legacy 2-letter pairs. Counts count down; 0 renders as `-`. Upgrade CTA: `Taso 4 (Päätteet) →`.
  - **Tier 4 (Sananpäätteet):** Active suffix list with remaining counts.
  - Switching between unlocked tiers remains available via understated level links (`Taso 1 | 2 | 3 | 4`).
- **`RankProgress.tsx`**:
  - Add 3 milestone pips directly along the progress bar track at 25%, 50%, and 70%.
  - When playing without hints, reaching a milestone fills the pip.
  - When Tier 1 is activated, unachieved pips lock in their unachieved state.
- **`Honeycomb.tsx`**:
  - Add Pangram ripple animation: staggered scale/glow pulse from center hex outward across the 6 outer petals.
  - Add smooth shuffle rotation: 60° spring rotation/swap animation on outer petals when shuffled.
- **`WordInput.tsx`**:
  - Letter pop-in transition on typed characters and subtle breathing pulse on idle cursor `|`.
- **`useKeyboard.ts`**:
  - Bind `Space` key to `shuffleLetters()`.
- **`useGameStore.ts`**:
  - Detect when all words for a starting letter are found -> trigger toast: `"Kaikki K-alkuiset sanat löydetty! 🎯"`.
  - Track `hintTier` (0..4) and persist in `hintsUnlocked`.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit / Domain: `deriveHintData` derives starting letters, pangram details, matrix (letter x length), and suffixes with accurate subtraction of found words.
- [x] Unit / Domain: `NO_HINT_ACHIEVEMENTS` exports "Avuitta taitava" and awards milestone at 50% score.
- [x] Integration: Server `computePuzzle` produces valid `matrix`, `pangram_details`, and `suffixes` on seeded puzzles.
- [x] Web Unit: `HintDeck` renders Tier 0..4 transitions in a fixed-height container and does not exceed height.
- [x] Web Unit: Progress bar renders 3 milestone pips and reflects "Avuitta" status.
- [x] Web Unit: `useKeyboard` triggers shuffle when Space is pressed.
- [x] Web Unit: Letter-cleared toast fires when last word of a starting letter is submitted.
- [x] Architectural Fitness: `pnpm check:agent` passes 100% (typecheck, lint, test:arch, test:unit, build).
- [x] E2E / Visual: Playwright verifies mobile layout fits within viewport without vertical scroll during active play, honeycomb remains stationary across hint tier upgrades.
