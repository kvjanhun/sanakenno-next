import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyStats,
  STATS_STORAGE_KEY,
  type PlayerStats,
  type PuzzleResponse,
  type SyncPayload,
} from '@sanakenno/shared';
import * as clientModule from '../../packages/web/src/api/client.js';
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
import { backfillNoHintStats } from '../../packages/web/src/features/modals/backfillStats.js';
import {
  AUTH_TOKEN_STORAGE_KEY,
  gatherLocalData,
  pullAndMergeData,
} from '../../packages/web/src/features/player-sync/sync-reconcile.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';

async function buildMockPuzzle(
  puzzleNumber = 10,
  date = '2026-11-21',
  words = ['kana', 'sana', 'kansa'],
): Promise<PuzzleResponse> {
  const hashes = await Promise.all(words.map((w) => hashWord(w)));
  return {
    puzzle_number: puzzleNumber,
    display_number: puzzleNumber,
    total_puzzles: 20,
    date,
    center: 'a',
    letters: ['e', 'i', 'k', 'l', 'n', 's'],
    word_hashes: hashes,
    max_score: 50,
    hint_data: {
      word_count: words.length,
      pangram_count: 0,
      by_letter: { k: 2, s: 1 },
      by_length: { '4': 2, '5': 1 },
      by_pair: { ka: 2, sa: 1 },
    },
  };
}

describe('Spec 38: Hint Activation Sync, Stats & Gameplay State Integrity', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    useGameStore.getState().reset();
    await useAuthStore.getState().flushPendingSync();
  });

  it('unlocks first hint with 0 words found: syncs & flushes immediately without creating a 0-word StatsRecord, and includes state in gatherLocalData', async () => {
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'token-123');

    const puzzle = await buildMockPuzzle(10);
    await useGameStore.getState().loadPuzzle(puzzle);
    expect(useUiStore.getState().hintsHidden).toBe(true);

    // Invalid or unknown hint ID is a strict no-op
    useGameStore.getState().unlockHint('not_a_hint');
    expect(useGameStore.getState().hintsUnlocked.size).toBe(0);
    expect(postSpy).not.toHaveBeenCalled();

    // First valid hint unlock with 0 words found
    useGameStore.getState().unlockHint('tier1');
    expect(useUiStore.getState().hintsHidden).toBe(false);
    expect([...useGameStore.getState().hintsUnlocked]).toEqual(['tier1']);
    expect(useGameStore.getState().scoreBeforeHints).toBe(0);

    // Immediate flush was triggered on first hint unlock
    await Promise.resolve();
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      'token-123',
      expect.objectContaining({
        puzzle_number: 10,
        found_words: [],
        score: 0,
        hints_unlocked: ['tier1'],
        score_before_hints: 0,
      }),
    );

    // Must NOT have created a 0-word StatsRecord in localStorage
    const localStats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(localStats).toBeNull();

    // Yet gatherLocalData() includes the 0-word hint-unlocked state for device transfer
    const gathered = gatherLocalData();
    expect(gathered.puzzle_states).toEqual([
      expect.objectContaining({
        puzzle_number: 10,
        found_words: [],
        hints_unlocked: ['tier1'],
        score_before_hints: 0,
      }),
    ]);

    // Calling unlockHint again with the same ID is a no-op
    useGameStore.getState().unlockHint('tier1');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces second and third hint unlocks via debounce and updates local stats when words were already found', async () => {
    vi.useFakeTimers();
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    vi.spyOn(clientModule, 'postWordFind').mockImplementation(() => {});
    vi.spyOn(clientModule, 'postAchievement').mockImplementation(() => {});
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'token-123');

    const puzzle = await buildMockPuzzle(11);
    await useGameStore.getState().loadPuzzle(puzzle);

    // Solve 'kansa' (5 pts) unassisted
    useGameStore.setState({ currentWord: 'kansa' });
    await useGameStore.getState().submitWord();
    await useAuthStore.getState().flushPendingSync();
    postSpy.mockClear();

    // 1st hint unlock -> locks scoreBeforeHints = 5, updates local stats hints_used = 1, flushes immediately
    useGameStore.getState().unlockHint('tier1');
    await Promise.resolve();
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenLastCalledWith(
      'token-123',
      expect.objectContaining({
        puzzle_number: 11,
        score: 5,
        hints_unlocked: ['tier1'],
        score_before_hints: 5,
        best_no_hint_score: 5,
      }),
    );
    expect(loadFromStorage<PlayerStats>(STATS_STORAGE_KEY)?.records[0]?.hints_used).toBe(1);

    // 2nd and 3rd hint unlocks in rapid succession -> debounced (not immediately flushed)
    postSpy.mockClear();
    useGameStore.getState().unlockHint('tier2');
    useGameStore.getState().unlockHint('pairs');
    expect(postSpy).not.toHaveBeenCalled();
    expect(loadFromStorage<PlayerStats>(STATS_STORAGE_KEY)?.records[0]?.hints_used).toBe(3);

    await vi.runAllTimersAsync();
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      'token-123',
      expect.objectContaining({
        hints_unlocked: ['tier1', 'tier2', 'pairs'],
        score_before_hints: 5,
      }),
    );

    vi.useRealTimers();
  });

  it('guards submitWord against rapid double-Enter and mid-hash puzzle switches', async () => {
    const wordFindSpy = vi.spyOn(clientModule, 'postWordFind').mockImplementation(() => {});
    vi.spyOn(clientModule, 'postAchievement').mockImplementation(() => {});
    vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();

    const puzzleA = await buildMockPuzzle(20, '2026-11-21', ['kana']);
    const puzzleB = await buildMockPuzzle(21, '2026-11-20', ['sana']);
    await useGameStore.getState().loadPuzzle(puzzleA);

    // Rapid double-submit of 'kana'
    useGameStore.setState({ currentWord: 'kana' });
    await Promise.all([useGameStore.getState().submitWord(), useGameStore.getState().submitWord()]);

    expect(useGameStore.getState().score).toBe(1);
    expect(wordFindSpy).toHaveBeenCalledTimes(1);

    // Now start submitting on puzzleA, but switch to puzzleB before submitWord finishes
    await useGameStore.getState().loadPuzzle(puzzleA);
    localStorage.clear();
    await useGameStore.getState().loadPuzzle(puzzleA);
    useGameStore.setState({ currentWord: 'kana' });
    const pendingSubmit = useGameStore.getState().submitWord();
    await useGameStore.getState().loadPuzzle(puzzleB);
    await pendingSubmit;

    // Puzzle B must remain untouched at score 0 with 0 found words
    expect(useGameStore.getState().puzzle?.puzzle_number).toBe(21);
    expect(useGameStore.getState().score).toBe(0);
    expect(useGameStore.getState().foundWords.size).toBe(0);
  });

  it('stamps puzzle.date with is_daily: false when midnight passes before rollover refresh', async () => {
    const syncSpy = vi
      .spyOn(useAuthStore.getState(), 'syncProgressDebounced')
      .mockImplementation(() => {});
    vi.spyOn(clientModule, 'postWordFind').mockImplementation(() => {});
    vi.spyOn(clientModule, 'postAchievement').mockImplementation(() => {});

    // Active puzzle was loaded yesterday ('2020-01-01'), viewingPuzzleDate is still null
    const yesterdayPuzzle = await buildMockPuzzle(30, '2020-01-01', ['kana']);
    await useGameStore.getState().loadPuzzle(yesterdayPuzzle);
    useUiStore.getState().setViewingPuzzleDate(null);

    useGameStore.setState({ currentWord: 'kana' });
    await useGameStore.getState().submitWord();

    const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
    expect(stats?.records[0]?.date).toBe('2020-01-01');
    expect(stats?.records[0]?.is_daily).toBe(false);
    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2020-01-01',
        is_daily: false,
      }),
    );
  });

  it('isolates revealed puzzles from local stats, server sync, telemetry, gatherLocalData, and backfillNoHintStats', async () => {
    const syncSpy = vi
      .spyOn(useAuthStore.getState(), 'syncProgressDebounced')
      .mockImplementation(() => {});
    const wordFindSpy = vi.spyOn(clientModule, 'postWordFind').mockImplementation(() => {});
    const failedGuessSpy = vi.spyOn(clientModule, 'postFailedGuess').mockImplementation(() => {});

    const puzzle = await buildMockPuzzle(40, '2026-11-15', ['kana']);
    setRawStorage(revealedKey(40), 'true');
    await useGameStore.getState().loadPuzzle(puzzle);

    // Unlocking hint, submitting invalid word, and submitting valid word on revealed puzzle
    useGameStore.getState().unlockHint('tier1');
    useGameStore.setState({ currentWord: 'kaka' });
    await useGameStore.getState().submitWord();
    useGameStore.setState({ currentWord: 'kana' });
    await useGameStore.getState().submitWord();

    expect(syncSpy).not.toHaveBeenCalled();
    expect(wordFindSpy).not.toHaveBeenCalled();
    expect(failedGuessSpy).not.toHaveBeenCalled();
    expect(loadFromStorage<PlayerStats>(STATS_STORAGE_KEY)).toBeNull();

    // Also populate a timer-only ghost state on slot 41 and a valid unrevealed state on slot 42
    saveToStorage<PersistedPuzzleState>(puzzleStateKey(41), {
      foundWords: [],
      score: 0,
      hintsUnlocked: [],
      startedAt: 1000,
      totalPausedMs: 50,
      scoreBeforeHints: null,
    });
    saveToStorage<PersistedPuzzleState>(puzzleStateKey(42), {
      foundWords: ['sana'],
      score: 1,
      hintsUnlocked: [],
      startedAt: 1000,
      totalPausedMs: 0,
      scoreBeforeHints: null,
    });

    // gatherLocalData includes revealed slot 40 (with revealed: true) and valid unrevealed slot 42, excludes timer-only slot 41
    const gathered = gatherLocalData();
    expect(gathered.puzzle_states.map((s) => s.puzzle_number)).toEqual([40, 42]);
    expect(gathered.puzzle_states.find((s) => s.puzzle_number === 40)?.revealed).toBe(true);
    expect(gathered.puzzle_states.find((s) => s.puzzle_number === 42)?.revealed).toBeUndefined();

    // backfillNoHintStats does not fabricate missing records for slot 40 or 42
    const backfilled = backfillNoHintStats(emptyStats());
    expect(backfilled.records).toEqual([]);
    expect(backfilled.version).toBe(1);

    // pullAndMergeData preserves version: 1
    const serverPayload: SyncPayload = {
      stats: {
        version: 1,
        records: [
          {
            puzzle_number: 50,
            date: '2026-11-10',
            best_rank: 'Hyvä alku',
            best_score: 5,
            max_score: 50,
            words_found: 2,
            hints_used: 0,
            elapsed_ms: 1000,
          },
        ],
      },
      puzzle_states: [],
      preferences: null,
    };
    pullAndMergeData(serverPayload, () => {});
    expect(loadFromStorage<PlayerStats>(STATS_STORAGE_KEY)?.version).toBe(1);
  });
});
