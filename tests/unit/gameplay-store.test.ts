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
});
