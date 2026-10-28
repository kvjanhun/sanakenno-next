import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyServerPreferences,
  buildLocalPreferences,
  gatherLocalData,
  pullAndMergeData,
  pushLocalDataAheadOfServer,
} from '../../packages/web/src/features/player-sync/sync-reconcile.js';
import {
  saveToStorage,
  loadFromStorage,
  puzzleStateKey,
  STATS_STORAGE_KEY,
} from '../../packages/web/src/features/gameplay/storage.js';
import { usePaletteStore } from '../../packages/web/src/features/theme/usePaletteStore.js';
import { useThemePreferenceStore } from '../../packages/web/src/features/theme/useThemePreferenceStore.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';

describe('Player Sync & Reconcile (Web Store)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({
      isLoggedIn: false,
      playerId: null,
      playerKey: null,
      isLinked: false,
      isLoading: false,
      error: null,
    });
  });

  it('gathers local stats and puzzle state for syncing', () => {
    saveToStorage(STATS_STORAGE_KEY, {
      records: [
        {
          puzzle_number: 1,
          date: '2026-04-10',
          best_rank: 'Onnistuja',
          best_score: 30,
          max_score: 100,
          words_found: 5,
          hints_used: 0,
          elapsed_ms: 60000,
          pangrams_found: 0,
        },
      ],
    });

    saveToStorage(puzzleStateKey(1), {
      foundWords: ['kana', 'kala'],
      score: 2,
      hintsUnlocked: [],
      startedAt: 123456,
      totalPausedMs: 0,
      scoreBeforeHints: 2,
    });

    const gathered = gatherLocalData();
    expect(gathered.stats.records).toHaveLength(1);
    expect(gathered.stats.records[0]?.puzzle_number).toBe(1);
    expect(gathered.puzzle_states).toHaveLength(1);
    expect(gathered.puzzle_states[0]?.found_words).toEqual(['kana', 'kala']);
  });

  it('merges server progress monotonically into local storage without losing progress', () => {
    saveToStorage(STATS_STORAGE_KEY, {
      records: [
        {
          puzzle_number: 1,
          date: '2026-04-10',
          best_rank: 'Sanavalmis',
          best_score: 50,
          max_score: 100,
          words_found: 8,
          hints_used: 0,
          elapsed_ms: 30000,
          pangrams_found: 1,
        },
      ],
    });

    saveToStorage(puzzleStateKey(1), {
      foundWords: ['kana', 'kukko'],
      score: 6,
      hintsUnlocked: [],
      startedAt: 1000,
      totalPausedMs: 0,
      scoreBeforeHints: 6,
    });

    let pushedPrefs = false;
    const changed = pullAndMergeData(
      {
        stats: {
          version: 1,
          records: [
            {
              puzzle_number: 1,
              date: '2026-04-10',
              best_rank: 'Hyvä alku', // worse rank -> should NOT overwrite
              best_score: 20, // worse score -> should NOT overwrite
              max_score: 100,
              words_found: 3,
              hints_used: 0,
              elapsed_ms: 60000,
              pangrams_found: 0,
            },
            {
              puzzle_number: 2,
              date: '2026-04-11',
              best_rank: 'Onnistuja',
              best_score: 35,
              max_score: 90,
              words_found: 5,
              hints_used: 1,
              elapsed_ms: 45000,
              pangrams_found: 0,
            },
          ],
        },
        puzzle_states: [
          {
            puzzle_number: 1,
            found_words: ['kana', 'aasi'], // union: kana, kukko, aasi
            score: 7,
            hints_unlocked: ['grid'],
            started_at: 1000,
            total_paused_ms: 0,
            score_before_hints: 6,
          },
        ],
      },
      () => {
        pushedPrefs = true;
      },
    );

    expect(changed).toBe(true);
    expect(pushedPrefs).toBe(false);

    const mergedStats = loadFromStorage<{
      records: Array<{ puzzle_number: number; best_score: number }>;
    }>(STATS_STORAGE_KEY);
    expect(mergedStats?.records).toHaveLength(2);
    // Puzzle 1 kept the better score 50
    expect(mergedStats?.records.find((r) => r.puzzle_number === 1)?.best_score).toBe(50);
    // Puzzle 2 was added
    expect(mergedStats?.records.find((r) => r.puzzle_number === 2)?.best_score).toBe(35);

    const mergedState = loadFromStorage<{ foundWords: string[] }>(puzzleStateKey(1));
    expect(mergedState?.foundWords.sort()).toEqual(['aasi', 'kana', 'kukko']);
  });

  it('reconciles preferences between local and server', () => {
    usePaletteStore.getState().setThemeId('hehku');
    useThemePreferenceStore.getState().setPreference('dark');

    const localPrefs = buildLocalPreferences();
    expect(localPrefs.themeId).toBe('hehku');
    expect(localPrefs.themePreference).toBe('dark');

    // Newer server preferences override local
    let pushed = false;
    applyServerPreferences(
      {
        themeId: 'metsa',
        themePreference: 'light',
        updated_at: '2099-01-01T00:00:00.000Z',
      },
      () => {
        pushed = true;
      },
    );

    expect(usePaletteStore.getState().themeId).toBe('metsa');
    expect(useThemePreferenceStore.getState().preference).toBe('light');
    expect(pushed).toBe(false);
  });

  it('pushes local records absent or ahead of server on pull', async () => {
    const pushedStats: unknown[] = [];
    const pushedStates: unknown[] = [];

    const localData = {
      stats: {
        version: 1 as const,
        records: [
          {
            puzzle_number: 1,
            date: '2026-04-10',
            best_rank: 'Sanavalmis',
            best_score: 50,
            max_score: 100,
            words_found: 8,
            hints_used: 0,
            elapsed_ms: 30000,
            pangrams_found: 1,
          },
          {
            puzzle_number: 3, // absent on server
            date: '2026-04-12',
            best_rank: 'Hyvä alku',
            best_score: 10,
            max_score: 100,
            words_found: 2,
            hints_used: 0,
            elapsed_ms: 10000,
            pangrams_found: 0,
          },
        ],
      },
      puzzle_states: [
        {
          puzzle_number: 1,
          found_words: ['aasi', 'kana', 'kukko'], // 3 words ahead of server's 2
          score: 7,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 7,
        },
      ],
    };

    const serverPayload = {
      stats: {
        version: 1 as const,
        records: [
          {
            puzzle_number: 1,
            date: '2026-04-10',
            best_rank: 'Onnistuja',
            best_score: 30, // server has lower score
            max_score: 100,
            words_found: 5,
            hints_used: 0,
            elapsed_ms: 30000,
            pangrams_found: 0,
          },
        ],
      },
      puzzle_states: [
        {
          puzzle_number: 1,
          found_words: ['aasi', 'kana'],
          score: 2,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 2,
        },
      ],
    };

    const res = pushLocalDataAheadOfServer(localData, serverPayload, {
      syncStatsRecord: async (r) => {
        pushedStats.push(r);
      },
      syncPuzzleState: async (s) => {
        pushedStates.push(s);
      },
    });

    expect(res.pushedStats).toBe(2); // both puzzle 1 (ahead) and puzzle 3 (absent)
    expect(res.pushedStates).toBe(1); // puzzle 1 ahead
    expect(pushedStats).toHaveLength(2);
    expect(pushedStates).toHaveLength(1);
  });
});
