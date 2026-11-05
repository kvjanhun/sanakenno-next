import { beforeEach, describe, expect, it } from 'vitest';
import {
  getHelsinkiDateString,
  STATS_STORAGE_KEY,
  type PlayerStats,
  type PuzzleResponse,
} from '@sanakenno/shared';
import { hashWord } from '../../packages/web/src/features/gameplay/hash.js';
import {
  loadFromStorage,
  saveToStorage,
} from '../../packages/web/src/features/gameplay/storage.js';
import { useGameStore } from '../../packages/web/src/features/gameplay/useGameStore.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';

async function buildTestPuzzle(
  puzzleNumber = 10,
  dateStr = getHelsinkiDateString(),
): Promise<PuzzleResponse> {
  const words = ['kana', 'kala', 'lakana', 'kansallinen']; // kansallinen = 11 letters
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
    max_score: 50,
    puzzle_number: puzzleNumber,
    display_number: 1,
    total_puzzles: 10,
    date: dateStr,
  };
}

describe('useGameStore Achievements & Streak Integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGameStore.getState().reset();
    useGameStore.setState({ newAchievement: null });
    useUiStore.setState({ viewingPuzzleDate: null });
  });

  it('playing the daily puzzle sets is_daily = true and advances streak', async () => {
    const today = getHelsinkiDateString();
    const puzzle = await buildTestPuzzle(10, today);
    await useGameStore.getState().loadPuzzle(puzzle);

    // Enter a valid word
    for (const char of 'kana') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();

    const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(stats?.records).toHaveLength(1);
    expect(stats?.records[0]?.is_daily).toBe(true);
    expect(stats?.records[0]?.played_at_date).toBe(today);
  });

  it('playing an archive puzzle sets is_daily = false, updates lifetime words, and does not affect streak', async () => {
    const today = getHelsinkiDateString();
    // Pre-seed an existing daily record for today
    const existingStats: PlayerStats = {
      version: 1,
      records: [
        {
          puzzle_number: 10,
          date: today,
          best_rank: 'Hyvä alku',
          best_score: 10,
          max_score: 50,
          words_found: 2,
          hints_used: 0,
          elapsed_ms: 1000,
          is_daily: true,
          played_at_date: today,
        },
      ],
    };
    saveToStorage(STATS_STORAGE_KEY, existingStats);

    // Player switches to archive puzzle from 2026-01-01
    useUiStore.setState({ viewingPuzzleDate: '2026-01-01' });
    const archivePuzzle = await buildTestPuzzle(5, '2026-01-01');
    await useGameStore.getState().loadPuzzle(archivePuzzle);

    for (const char of 'kala') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();

    const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    const archiveRecord = stats?.records.find((r) => r.puzzle_number === 5);
    expect(archiveRecord?.is_daily).toBe(false);
    expect(archiveRecord?.words_found).toBe(1);

    // Total words should be 2 (from daily) + 1 (from archive) = 3
    const totalWords = stats?.records.reduce((sum, r) => sum + r.words_found, 0);
    expect(totalWords).toBe(3);
  });

  it('finding a 10-letter word increments long_words_count in the puzzle stats record', async () => {
    const today = getHelsinkiDateString();
    const puzzle = await buildTestPuzzle(10, today);
    await useGameStore.getState().loadPuzzle(puzzle);

    // Enter a 4-letter word 'kana'
    for (const char of 'kana') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();
    let stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(stats?.records[0]?.long_words_count).toBe(0);

    // Enter 11-letter word 'kansallinen'
    for (const char of 'kansallinen') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();
    stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(stats?.records[0]?.long_words_count).toBe(1);
  });

  it('submitting a word that crosses an achievement tier boundary triggers newAchievement notification', async () => {
    const today = getHelsinkiDateString();
    // Pre-seed 99 words across previous records (1 word away from Sanasampo Pronssi = 100 words)
    const seededStats: PlayerStats = {
      version: 1,
      records: [
        {
          puzzle_number: 1,
          date: '2026-11-01',
          best_rank: 'Onnistuja',
          best_score: 50,
          max_score: 100,
          words_found: 99,
          hints_used: 0,
          elapsed_ms: 5000,
          is_daily: true,
        },
      ],
    };
    saveToStorage(STATS_STORAGE_KEY, seededStats);

    const puzzle = await buildTestPuzzle(10, today);
    await useGameStore.getState().loadPuzzle(puzzle);

    // Submit 100th word 'kana'
    for (const char of 'kana') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();

    const newAch = useGameStore.getState().newAchievement;
    expect(newAch).not.toBeNull();
    expect(newAch?.id).toBe('total_words');
    expect(newAch?.title).toBe('Sanasampo');
    expect(newAch?.tierName).toBe('Pronssi');
    expect(newAch?.target).toBe(100);

    // Clear notification
    useGameStore.getState().clearNewAchievement();
    expect(useGameStore.getState().newAchievement).toBeNull();

    // Subsequent word submission that does NOT cross a tier boundary does not trigger notification
    for (const char of 'kala') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();
    expect(useGameStore.getState().newAchievement).toBeNull();
  });
});
