# Spec 13: Kotus Wordlist Cleanup, Hyphenated Lemma Normalization & Database Filtering

Status: shipped
Branch: spec/13-kotus-wordlist-cleanup-and-db-filtering

## 1. Objective

Clean up the Kotus Finnish dictionary pipeline from `nykysuomensanalista2024.txt`:
1. Include legitimate hyphenated compound words (e.g. `aamu-uninen`, `e-kirja`) while stripping raw prefixes (`prefix-`) and suffixes (`-suffix`).
2. Accept both hyphenated and un-hyphenated forms (`aamu-uninen` and `aamuuninen`) seamlessly during gameplay, while preserving the hyphenated lemma for Kotus dictionary links (`https://www.kielitoimistonsanakirja.fi/#/aamu-uninen`) and solution reveals.
3. Migrate offensive words previously removed from the static text file into the SQLite `blocked_words` database table, keeping the static wordlist faithful to Kotus and word curation dynamic.

## 2. Invariants & Non-Goals

- **Wordlist Storage Invariant:** The primary dictionary remains an in-memory `Set<string>` loaded from `packages/server/assets/kotus_words.txt` on startup (~6ms scan, zero SQLite/Litestream replication bloat, instant `:memory:` test isolation).
- **Honeycomb Input Invariant:** The 7-letter Honeycomb UI has no hyphen button; entering `aamuuninen` on Honeycomb and typing either `aamuuninen` or `aamu-uninen` on physical keyboard both hash to the identical normalized SHA-256 digest.
- **Kotus Linking Invariant:** Words displayed in `PuzzleWordsModal` and links to Kielitoimiston sanakirja use the canonical Kotus lemma (e.g. `aamu-uninen`, not broken `aamuuninen`).
- **Blocked Words Parity:** Inappropriate words are blocked dynamically via SQLite `blocked_words`, never silently dropped from the dictionary asset. Religious and cultural words (`raamattu`, `koraani`, `suvivirsi`) and standard conversational Finnish swearwords remain unblocked.
- **Zero Scope Creep:** No changes to honeycomb hexagonal layout, rank progression thresholds, or admin navigation tabs.

## 3. Contract & Architecture

### Wordlist Ingestion Script (`scripts/filter-kotus-wordlist.ts`)

- Filters `packages/server/assets/nykysuomensanalista2024.txt` (104,743 entries) into `packages/server/assets/kotus_words.txt` (102,659 entries):
  - Normalizes non-breaking hyphens (`\u2011`) to ASCII `-`.
  - Discards prefixes (ending in `-`) and suffixes (starting with `-`).
  - Discards multi-word phrases (spaces), digits (`[0-9]`), and non-Finnish characters (`FINNISH_LETTERS` + `-`).
  - Discards entries where length without hyphens < 4 characters.
  - Retains all 1,247 Finnish hyphenated compound words in their lemma form (e.g. `aamu-uninen`).

### Server Wordlist Engine (`packages/server/src/features/puzzle/wordlist.ts`)

- `loadWordlist()` loads `kotus_words.txt`:
  - Builds `_allWords`: `Set<string>` containing normalized lowercase words without hyphens (`aamuuninen`) for 6ms fast puzzle generation and anagram scanning.
  - Builds `_lemmaMap`: `Map<string, string>` mapping normalized form (`aamuuninen`) back to Kotus lemma (`aamu-uninen`).
- `puzzleWords()` and `computePuzzle()` continue operating on normalized strings, but puzzle data returned for solution reveal (`/api/puzzle/:number/words`) exposes canonical lemmas so players see grammatically proper Finnish words.
- `buildKotusUrl(word)` in `@sanakenno/shared`:
  - Maps normalized forms to their canonical hyphenated lemma when linking to Kotus (ensuring `https://www.kielitoimistonsanakirja.fi/#/aamu-uninen` resolves correctly).

### Database Migration & Seed (`packages/server/src/db/baseline-sql.ts`)

- Add migration `0003-seed-curated-blocked-words`:
  - Inserts the curated list of slurs, hate speech, and explicit violence into `blocked_words` table via `INSERT OR IGNORE`.
  - Merges cleanly with existing 122 manual blocked words from production history.

### Client Gameplay Integration (`packages/web/src/features/gameplay/useGameStore.ts`)

- `useKeyboard` and `useGameStore.submitWord()`:
  - Entering `aamu-uninen` or `aamuuninen` normalizes by removing hyphens before checking `state.wordHashSet()`.
  - Both input methods match the puzzle solution seamlessly.
- `PuzzleWordsModal.tsx`:
  - Renders words with their canonical hyphenated form and Kotus link.
  - Marks words as found using normalized comparison (`foundWords.has(word) || foundWords.has(normalizeWord(word))`).

## 4. Acceptance Criteria (Test Catalog)

- [ ] **Wordlist Filter Accuracy:** `scripts/filter-kotus-wordlist.ts` processes `nykysuomensanalista2024.txt` to exactly 102,659 entries, filtering all prefixes (`ala-`), suffixes (`-lainen`), and retaining all valid Finnish hyphenated compounds (`aamu-uninen`, `e-kirja`).
- [ ] **Hyphen Normalization Invariant:** Both `aamu-uninen` and `aamuuninen` resolve to the same normalized hash and are accepted during gameplay.
- [ ] **Kotus Dictionary Linking:** `buildKotusUrl('aamuuninen')` and `buildKotusUrl('aamu-uninen')` both link to `https://www.kielitoimistonsanakirja.fi/#/aamu-uninen`.
- [ ] **Database Blocked Words Seed:** Curated slurs and explicit violence are seeded into `blocked_words`; religious words (`raamattu`, `koraani`) are playable.
- [ ] **Mechanical Gate:** `pnpm run check:agent` passes 100% (types, lint, architecture, unit & integration tests, production build).
