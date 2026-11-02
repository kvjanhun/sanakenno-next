# Spec 16: Clues Revamp & Granular Unlocks (Vihjeet)

Status: shipped
Branch: spec/16-clues-revamp-and-granular-unlocks
Reference (1.0): /Users/erezac/Projects/sanakenno/packages/web/src/components/HintPanels.tsx

## 1. Objective

Revamp the "Vihjeet" gameplay hint tab into three distinct, separately unlockable clue modules—Pangrammit (pangrams), top 7 alkuparit (starting two-letter pairs), and top 7 sananpäätteet (suffixes)—ensuring visually balanced and cohesive rendering in all open/closed combinations within the fixed 172px deck.

## 2. Invariants & Non-Goals

### Invariants
- **Fixed Deck Height (Zero Board Shift):** The hint deck must remain strictly 172px tall (`DECK_HEIGHT = '172px'`) across all states and combinations so the honeycomb letter grid never shifts.
- **Top 7 Selection Parity:**
  - Alkuparit: Select the 7 two-letter prefixes with the highest initial word counts in the puzzle (tie-broken by Finnish alphabetical order). Counts reflect remaining unfound words, showing `✓` when 0 remain.
  - Sananpäätteet: Select the 7 suffixes with the highest initial word counts in the puzzle (tie-broken by Finnish alphabetical order). Counts reflect remaining unfound words, showing `✓` when 0 remain.
- **Granular Independent Unlocking:** Players can unlock any of the three parts individually in any order:
  - Pangrams: `tier2` (alias `pangrams`)
  - Alkuparit: `pairs`
  - Sananpäätteet: `tier4` (alias `suffixes`)
- **Vihjeet Level Pips:** The Vihjeet tab button displays 3 level pips (0 to 3 active) reflecting the number of unlocked sections out of 3. (Matriisi tab retains 2 pips: totals and 2D grid).
- **Aesthetic Consistency & Anti-Slop:** No gratuitous nested borders or decorative clutter. Clean typography, standard tokens (`var(--color-bg-secondary)`, `var(--color-accent)`, `var(--color-text-*)`), and balanced layout across 0 open, 1 open, 2 open, and 3 open states.
- **Monolith Ceiling:** All source and test files must remain under 500 lines.

### Non-Goals
- No changes to base puzzle scoring, dictionary validation, or database schema.
- No changes to the "Matriisi" tab logic or layout.
- No changes to player sync protocols (existing hint IDs `tier2`, `tier4`, `pairs` are already valid in sync schemas).

## 3. Contract & Architecture

### 3.1 Shared Domain (`@sanakenno/shared`)
- **`hint-data.ts`**:
  - Add helper functions to extract top N entries from `PairEntry[]` and `SuffixEntry[]`:
    - `getTopPairs(pairMap: PairEntry[], limit = 7): PairEntry[]`
    - `getTopSuffixes(suffixMap: SuffixEntry[], limit = 7): SuffixEntry[]`
    - Deterministic sort: `total` descending, then Finnish alphabetical order ascending.

### 3.2 Web Frontend (`@sanakenno/web`)
- **`HintParts.tsx`**:
  - Update `LevelPips` component to accept `max?: number` (default 2, set to 3 for Vihjeet).
  - Decompose clues into modular section components:
    - `PangramClueSection`: displays unfound pangrams with first letter and length, plus found count; locked state shows title and unlock button.
    - `PairClueSection`: displays top 7 starting pairs with remaining counts and `✓` completion; locked state shows title and unlock button.
    - `SuffixClueSection`: displays top 7 suffixes with remaining counts and `✓` completion; locked state shows title and unlock button.
  - Add a unified, compact `ClueSectionRow` pattern that renders gracefully whether locked (compact row with "Avaa" button) or unlocked (section label + chip row).
- **`HintPanels.tsx`**:
  - Track individual unlock status for the 3 clue sections:
    - `hasPangrams`: `hintsUnlocked.has('tier2') || hintsUnlocked.has('pangrams')`
    - `hasPairs`: `hintsUnlocked.has('pairs')`
    - `hasSuffixes`: `hintsUnlocked.has('tier4') || hintsUnlocked.has('suffixes')`
  - Compute `unlockedCluesCount = (hasPangrams ? 1 : 0) + (hasPairs ? 1 : 0) + (hasSuffixes ? 1 : 0)`.
  - Pass `level={unlockedCluesCount}` and `max={3}` to the Vihjeet tab button's `LevelPips`.
  - In the Vihjeet content panel, render the 3 sections with dynamic spacing/sizing tailored to the number of open sections (0 open, 1 open, 2 open, 3 open) so the 172px container is always harmonious.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit / Domain: `getTopPairs` and `getTopSuffixes` deterministically return top 7 items sorted by total descending then Finnish alphabetical ascending, with remaining counts properly reflected.
- [x] Conventional UI (React Testing Library in Vitest):
  - Vihjeet tab shows 3 level pips reflecting 0, 1, 2, or 3 unlocked parts.
  - Each part (Pangrammit, Alkuparit, Sananpäätteet) can be unlocked independently.
  - Top 7 pairs and top 7 suffixes display remaining counts and mark completed items (`✓`).
  - Deck preserves 172px fixed height across all combinations of opened/closed parts.
- [x] Visual Inspection (`pnpm run screenshot` mobile + desktop):
  - Inspect screenshots for 0 open, 1 open, 2 open, and 3 open states on 390px mobile and 1280px desktop.
  - Ensure zero vertical scroll or overflow, crisp typography, and seamless integration into the game layout.
- [x] Mechanical Gate: `pnpm run check:agent` passes 100% (typecheck, lint, test:arch, test:unit, build).
