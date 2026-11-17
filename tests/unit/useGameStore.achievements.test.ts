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

  it('loading an existing solved puzzle in loadState backfills long_words_count in stats', async () => {
    const today = getHelsinkiDateString();
    const puzzle = await buildTestPuzzle(25, today);

    // Simulate already saved state in localStorage with 11-letter word 'kansallinen'
    saveToStorage(`sanakenno_state_25`, {
      foundWords: ['kana', 'kansallinen'],
      score: 15,
      hintsUnlocked: [],
      startedAt: Date.now() - 10000,
      totalPausedMs: 0,
      scoreBeforeHints: null,
    });

    // Stats has no long_words_count initially
    saveToStorage(STATS_STORAGE_KEY, {
      version: 1,
      records: [
        {
          puzzle_number: 25,
          date: today,
          best_rank: 'Onnistuja',
          best_score: 15,
          max_score: 50,
          words_found: 2,
          hints_used: 0,
          elapsed_ms: 10000,
          is_daily: true,
          // long_words_count missing
        },
      ],
    });

    // Loading puzzle runs loadState
    await useGameStore.getState().loadPuzzle(puzzle);

    const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    const rec = stats?.records.find((r) => r.puzzle_number === 25);
    expect(rec?.long_words_count).toBe(1);
  });

  it('submitting a word that crosses an achievement tier boundary triggers an achievement_unlocked announcement', async () => {
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

    const ann = useUiStore.getState().activeAnnouncement;
    expect(ann).not.toBeNull();
    expect(ann).toMatchObject({
      kind: 'achievement',
      category: 'achievement_unlocked',
      achievementId: 'total_words',
      title: 'Sanasampo',
      subtitle: 'Uusi saavutus · 100 sanaa',
      tierKey: 'bronze',
      tierName: 'Pronssi',
    });

    // Dismiss notification
    useUiStore.getState().dismissAnnouncement();
    expect(useUiStore.getState().activeAnnouncement).toBeNull();

    // Subsequent word submission that does NOT cross a tier boundary does not trigger achievement notification
    for (const char of 'kala') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();
    expect(useUiStore.getState().activeAnnouncement).toBeNull();
  });

  it('queues achievement_progress announcements when daily streak increments or pangram count reaches nextTierTarget - 1', async () => {
    const today = getHelsinkiDateString();
    const yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Pre-seed yesterday's daily play (streak = 1) and 5 pangrams (so next pangram -> 6/7 = 1 away from Pronssi)
    saveToStorage(STATS_STORAGE_KEY, {
      version: 1,
      records: [
        {
          puzzle_number: 1,
          date: yesterdayStr,
          best_rank: 'Onnistuja',
          best_score: 50,
          max_score: 100,
          words_found: 10,
          pangrams_found: 5,
          hints_used: 1,
          elapsed_ms: 5000,
          is_daily: true,
          played_at_date: yesterdayStr,
        },
      ],
    });

    const puzzle = await buildTestPuzzle(10, today);
    await useGameStore.getState().loadPuzzle(puzzle);

    for (const char of 'kansallinen') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();

    // 1st queued: Unassisted 25% milestone (18 / 50 = 36%)
    expect(useUiStore.getState().activeAnnouncement?.category).toBe('no_hint_milestone');
    useUiStore.getState().dismissAnnouncement();

    // 2nd queued: Daily streak progress (2 / 7 päivää)
    expect(useUiStore.getState().activeAnnouncement).toMatchObject({
      kind: 'achievement',
      category: 'achievement_progress',
      achievementId: 'streak',
      subtitle: 'Edistyminen · 2 / 7 päivää',
      isUnlock: false,
    });
    useUiStore.getState().dismissAnnouncement();

    // 3rd queued: Pangram near-unlock progress (6 / 7 pangrammia)
    expect(useUiStore.getState().activeAnnouncement).toMatchObject({
      kind: 'achievement',
      category: 'achievement_progress',
      achievementId: 'pangrams',
      subtitle: 'Edistyminen · 6 / 7 pangrammia',
      isUnlock: false,
    });
    useUiStore.getState().dismissAnnouncement();

    expect(useUiStore.getState().activeAnnouncement).toBeNull();
  });

  it('displays current streak (not historical best) when streak advances with best > current and fires near-unlock progress for full_board', async () => {
    const today = getHelsinkiDateString();
    const yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Historical 10-day streak (Pronssi already unlocked, Hopea target = 30), plus 1 existing full board (1 away from full_board Pronssi target = 2)
    //Wait: full_board Pronssi is 2, so reaching 1 full board hits nextTierTarget - 1 = 1!
    const historicalRecords: PlayerStats['records'] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date('2026-01-10T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      const ds = d.toISOString().slice(0, 10);
      historicalRecords.push({
        puzzle_number: 500 + i,
        date: ds,
        best_rank: 'Hyvä alku',
        best_score: 10,
        max_score: 100,
        words_found: 2,
        hints_used: 1,
        elapsed_ms: 1000,
        is_daily: true,
        played_at_date: ds,
      });
    }
    historicalRecords.push({
      puzzle_number: 1,
      date: yesterdayStr,
      best_rank: 'Hyvä alku',
      best_score: 10,
      max_score: 100,
      words_found: 2,
      hints_used: 1,
      elapsed_ms: 1000,
      is_daily: true,
      played_at_date: yesterdayStr,
    });
    saveToStorage(STATS_STORAGE_KEY, { version: 1, records: historicalRecords });

    // Build a 1-word puzzle with max_score = 1 so submitting 'kana' completes a full board (0 -> 1 = 2 - 1)
    const oneWordHash = await hashWord('kana');
    const fullBoardPuzzle: PuzzleResponse = {
      center: 'a',
      letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
      word_hashes: [oneWordHash],
      hint_data: {
        word_count: 1,
        pangram_count: 0,
        by_letter: { k: 1 },
        by_length: { '4': 1 },
        by_pair: { ka: 1 },
      },
      max_score: 1,
      puzzle_number: 10,
      display_number: 1,
      total_puzzles: 10,
      date: today,
    };

    await useGameStore.getState().loadPuzzle(fullBoardPuzzle);
    // Unlock a hint first so unassisted_master doesn't also unlock on full board
    useGameStore.getState().unlockHint('letters');

    for (const char of 'kana') {
      useGameStore.getState().addLetter(char);
    }
    await useGameStore.getState().submitWord();

    // 1st: letter_cleared for K
    expect(useUiStore.getState().activeAnnouncement?.category).toBe('letter_cleared');
    useUiStore.getState().dismissAnnouncement();

    // 2nd: streak progress shows current (2 / 30), NOT historical best (10 / 30)
    expect(useUiStore.getState().activeAnnouncement).toMatchObject({
      kind: 'achievement',
      category: 'achievement_progress',
      achievementId: 'streak',
      subtitle: 'Edistyminen · 2 / 30 päivää',
      tierKey: 'silver',
      tierName: 'Hopea',
      isUnlock: false,
    });
    useUiStore.getState().dismissAnnouncement();

    // 3rd: full_board hits nextTierTarget - 1 (1 / 2 kertaa)
    expect(useUiStore.getState().activeAnnouncement).toMatchObject({
      kind: 'achievement',
      category: 'achievement_progress',
      achievementId: 'full_board',
      subtitle: 'Edistyminen · 1 / 2 kertaa',
      tierKey: 'bronze',
      tierName: 'Pronssi',
      isUnlock: false,
    });
  });
});
