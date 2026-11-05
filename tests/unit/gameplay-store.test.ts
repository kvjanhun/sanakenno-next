import { beforeEach, describe, expect, it } from 'vitest';
import {
  STATS_STORAGE_KEY,
  type PlayerStats,
  type PuzzleResponse,
} from '../../packages/shared/src/index.js';
import { hashWord } from '../../packages/web/src/features/gameplay/hash.js';
import {
  loadFromStorage,
  puzzleStateKey,
  revealedKey,
  saveToStorage,
  setRawStorage,
  type PersistedPuzzleState,
} from '../../packages/web/src/features/gameplay/storage.js';
import { useGameStore } from '../../packages/web/src/features/gameplay/useGameStore.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';

async function buildSamplePuzzle(slot = 7): Promise<PuzzleResponse> {
  const words = ['kana', 'kala', 'lakana', 'kansallinen'];
  const wordHashes = await Promise.all(words.map((w) => hashWord(w)));

  return {
    center: 'a',
    letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
    word_hashes: wordHashes,
    hint_data: {
      word_count: words.length,
      pangram_count: 1,
      by_letter: { k: 3, l: 1 },
      by_length: { '4': 2, '6': 1, '11': 1 },
      by_pair: { ka: 3, la: 1 },
    },
    max_score: 25,
    puzzle_number: slot,
    display_number: 3,
    total_puzzles: 10,
  };
}

describe('Gameplay hybrid stores (useGameStore + useUiStore + storage)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGameStore.getState().reset();
  });

  it('validates submitted words via SHA-256 hashes and rejects invalid/missing-center/short words', async () => {
    const puzzle = await buildSamplePuzzle(7);
    await useGameStore.getState().loadPuzzle(puzzle);

    // 1. Too short (<4 chars)
    useGameStore.getState().addLetter('k');
    useGameStore.getState().addLetter('a');
    useGameStore.getState().addLetter('n');
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().score).toBe(0);
    expect(useUiStore.getState().message).toBe('Liian lyhyt!');
    expect(useUiStore.getState().wordRejected).toBe(true);

    // Typing after rejection replaces currentWord
    useGameStore.getState().addLetter('k');
    expect(useGameStore.getState().currentWord).toBe('k');
    expect(useUiStore.getState().wordRejected).toBe(false);

    // 2. Missing center letter 'a'
    useGameStore.getState().deleteLetter();
    for (const ch of 'kieli') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().score).toBe(0);
    expect(useUiStore.getState().message).toBe("Kirjain 'A' puuttuu!");

    // 3. Not in dictionary (valid letters + center, but hash not in word_hashes)
    useGameStore.getState().deleteLetter();
    for (const ch of 'kaaa') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().score).toBe(0);
    expect(useUiStore.getState().message).toBe('Ei sanakirjassa');

    // 4. Valid 4-letter word ('kana' = 1 pt)
    useGameStore.getState().deleteLetter();
    for (const ch of 'kana') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().score).toBe(1);
    expect(useGameStore.getState().foundWords.has('kana')).toBe(true);
    expect(useGameStore.getState().currentWord).toBe('');
    expect(useUiStore.getState().message).toBe('+1');
  });

  it('awards pangram bonus (+7) and triggers special Pangrammi! toast and celebration', async () => {
    const puzzle = await buildSamplePuzzle(8);
    await useGameStore.getState().loadPuzzle(puzzle);

    // 'kansallinen' = 11 letters + 7 pangram bonus = 18 points (18 / 26 >= 70% -> Ällistyttävä)
    for (const ch of 'kansallinen') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();

    expect(useGameStore.getState().score).toBe(18);
    expect(useGameStore.getState().rank()).toBe('Ällistyttävä');
    expect(useUiStore.getState().message).toBe('+18');
    expect(useUiStore.getState().secondaryMessage).toBe('Pangrammi!');
    expect(useUiStore.getState().secondaryType).toBe('special');
    expect(useUiStore.getState().celebration).toBe('nohint-allistyttava');
    expect(useUiStore.getState().pangramRipple).toBe(true);

    // Submitting 'lakana' (the only 'l' word) clears letter L
    for (const ch of 'lakana') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useUiStore.getState().secondaryMessage).toBe('Kaikki L-alkuiset löydetty!');

    // Shuffling triggers shuffleSpin
    useGameStore.getState().shuffleLetters();
    expect(useUiStore.getState().shuffleSpin).toBe(true);
  });

  it('captures scoreBeforeHints on first hint unlock and preserves it across subsequent words and hints', async () => {
    const puzzle = await buildSamplePuzzle(9);
    await useGameStore.getState().loadPuzzle(puzzle);

    expect(useGameStore.getState().scoreBeforeHints).toBeNull();

    // Score 6 points ('lakana') before unlocking any hints
    for (const ch of 'lakana') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().score).toBe(6);
    expect(useGameStore.getState().scoreBeforeHints).toBeNull();

    // Unlock first hint -> captures scoreBeforeHints = 6
    useGameStore.getState().unlockHint('summary');
    expect(useGameStore.getState().hintsUnlocked.has('summary')).toBe(true);
    expect(useGameStore.getState().scoreBeforeHints).toBe(6);

    // Find another word ('kana' = +1 -> score 7)
    for (const ch of 'kana') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().score).toBe(7);
    expect(useGameStore.getState().scoreBeforeHints).toBe(6);

    // Unlock second hint -> scoreBeforeHints stays 6
    useGameStore.getState().unlockHint('pairs');
    expect(useGameStore.getState().hintsUnlocked.has('pairs')).toBe(true);
    expect(useGameStore.getState().scoreBeforeHints).toBe(6);
  });

  it('persists and restores puzzle progress under sanakenno_state_<slot>', async () => {
    const puzzle = await buildSamplePuzzle(12);
    await useGameStore.getState().loadPuzzle(puzzle);

    for (const ch of 'lakana') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    useGameStore.getState().unlockHint('distribution');

    const rawPersisted = loadFromStorage<PersistedPuzzleState>(puzzleStateKey(12));
    expect(rawPersisted).not.toBeNull();
    expect(rawPersisted?.foundWords).toEqual(['lakana']);
    expect(rawPersisted?.score).toBe(6);
    expect(rawPersisted?.hintsUnlocked).toEqual(['distribution']);
    expect(rawPersisted?.scoreBeforeHints).toBe(6);

    // Reset memory state and reload puzzle -> restores from localStorage
    useGameStore.getState().reset();
    await useGameStore.getState().loadPuzzle(puzzle);

    expect(useGameStore.getState().score).toBe(6);
    expect([...useGameStore.getState().foundWords]).toEqual(['lakana']);
    expect([...useGameStore.getState().hintsUnlocked]).toEqual(['distribution']);
    expect(useGameStore.getState().scoreBeforeHints).toBe(6);
  });

  it('freezes player stats updates when revealed_<slot> is set to true', async () => {
    const puzzle = await buildSamplePuzzle(15);
    await useGameStore.getState().loadPuzzle(puzzle);

    // Normal unrevealed word find updates stats
    for (const ch of 'kana') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();

    const statsBeforeReveal = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(statsBeforeReveal?.records).toHaveLength(1);
    expect(statsBeforeReveal?.records[0]?.best_score).toBe(1);
    expect(statsBeforeReveal?.records[0]?.words_found).toBe(1);

    // Mark puzzle slot 15 as revealed
    setRawStorage(revealedKey(15), 'true');

    // Finding a high-scoring pangram after reveal must NOT mutate stats
    for (const ch of 'kansallinen') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();

    expect(useGameStore.getState().score).toBe(19);
    const statsAfterReveal = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(statsAfterReveal?.records).toHaveLength(1);
    expect(statsAfterReveal?.records[0]?.best_score).toBe(1);
    expect(statsAfterReveal?.records[0]?.words_found).toBe(1);
  });

  it('accepts both hyphenated and un-hyphenated input for compound words seamlessly', async () => {
    const hash = await hashWord('lainaaika');
    const puzzle: PuzzleResponse = {
      center: 'a',
      letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
      word_hashes: [hash],
      hint_data: {
        word_count: 1,
        pangram_count: 0,
        by_letter: { l: 1 },
        by_length: { '9': 1 },
        by_pair: { la: 1 },
      },
      max_score: 9,
      puzzle_number: 16,
      display_number: 5,
      total_puzzles: 10,
    };

    // Case 1: user types hyphenated 'laina-aika'
    await useGameStore.getState().loadPuzzle(puzzle);
    for (const ch of 'laina-aika') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().foundWords.has('lainaaika')).toBe(true);
    expect(useGameStore.getState().score).toBe(9);

    // Case 2: reset and user types un-hyphenated 'lainaaika'
    useGameStore.getState().reset();
    await useGameStore.getState().loadPuzzle(puzzle);
    for (const ch of 'lainaaika') {
      useGameStore.getState().addLetter(ch);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().foundWords.has('lainaaika')).toBe(true);
    expect(useGameStore.getState().score).toBe(9);
  });

  it('resets unlocked hints when loading a different unplayed puzzle', async () => {
    const puzzleA = await buildSamplePuzzle(20);
    await useGameStore.getState().loadPuzzle(puzzleA);

    useGameStore.getState().unlockHint('summary');
    expect(useGameStore.getState().hintsUnlocked.size).toBe(1);

    const puzzleB = await buildSamplePuzzle(21);
    await useGameStore.getState().loadPuzzle(puzzleB);

    expect(useGameStore.getState().hintsUnlocked.size).toBe(0);
    expect(useGameStore.getState().scoreBeforeHints).toBeNull();
  });

  it('loads saved hints when loading a previously played puzzle', async () => {
    saveToStorage(puzzleStateKey(22), {
      foundWords: [],
      score: 10,
      hintsUnlocked: ['summary', 'pairs'],
      startedAt: Date.now(),
      totalPausedMs: 0,
      scoreBeforeHints: 10,
    });

    const puzzle = await buildSamplePuzzle(22);
    await useGameStore.getState().loadPuzzle(puzzle);

    expect(useGameStore.getState().hintsUnlocked.size).toBe(2);
    expect(useGameStore.getState().hintsUnlocked.has('summary')).toBe(true);
    expect(useGameStore.getState().hintsUnlocked.has('pairs')).toBe(true);
    expect(useGameStore.getState().scoreBeforeHints).toBe(10);
  });

  it('manages per-puzzle hints collapsed/expanded defaults properly', async () => {
    // 1. Fresh unplayed puzzle starts with hints collapsed
    const puzzleA = await buildSamplePuzzle(30);
    await useGameStore.getState().loadPuzzle(puzzleA);
    expect(useUiStore.getState().hintsHidden).toBe(true);

    // 2. Player expands hints on puzzle A
    useUiStore.getState().setHintsHidden(false);
    expect(useUiStore.getState().hintsHidden).toBe(false);

    // 3. Player opens puzzle B from archive (no hints unlocked) -> hints start collapsed!
    const puzzleB = await buildSamplePuzzle(31);
    await useGameStore.getState().loadPuzzle(puzzleB);
    expect(useUiStore.getState().hintsHidden).toBe(true);

    // 4. Player unlocks a hint on puzzle B
    useGameStore.getState().unlockHint('tier1');
    expect(useUiStore.getState().hintsHidden).toBe(false);
    expect(useGameStore.getState().hintsUnlocked.size).toBe(1);

    // 5. Player opens puzzle C (archive puzzle previously played without hints) -> hints start collapsed!
    saveToStorage(puzzleStateKey(32), {
      foundWords: ['kana'],
      score: 1,
      hintsUnlocked: [],
      startedAt: Date.now(),
      totalPausedMs: 0,
      scoreBeforeHints: null,
    });
    const puzzleC = await buildSamplePuzzle(32);
    await useGameStore.getState().loadPuzzle(puzzleC);
    expect(useUiStore.getState().hintsHidden).toBe(true);

    // 6. Player opens puzzle D (archive puzzle previously played with hints unlocked) -> hints default to expanded!
    saveToStorage(puzzleStateKey(33), {
      foundWords: ['kana'],
      score: 1,
      hintsUnlocked: ['tier1'],
      startedAt: Date.now(),
      totalPausedMs: 0,
      scoreBeforeHints: 1,
    });
    const puzzleD = await buildSamplePuzzle(33);
    await useGameStore.getState().loadPuzzle(puzzleD);
    expect(useUiStore.getState().hintsHidden).toBe(false);

    // 7. Player returns to next day's puzzle (fresh unplayed) -> hints start collapsed!
    const puzzleNextDay = await buildSamplePuzzle(34);
    await useGameStore.getState().loadPuzzle(puzzleNextDay);
    expect(useUiStore.getState().hintsHidden).toBe(true);
  });
});
