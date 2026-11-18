import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { StatsRecord, SyncPuzzleState } from '@sanakenno/shared';
import * as clientModule from '../../packages/web/src/api/client.js';
import {
  AUTH_TOKEN_STORAGE_KEY,
  LINKED_STATE_STORAGE_KEY,
  PLAYER_KEY_STORAGE_KEY,
  PREFERENCES_UPDATED_AT_KEY,
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

function makeStatRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    puzzle_number: 1,
    date: '2026-04-10',
    best_rank: 'Onnistuja',
    best_score: 30,
    max_score: 100,
    words_found: 5,
    hints_used: 0,
    elapsed_ms: 60000,
    longest_word: '',
    pangrams_found: 0,
    best_no_hint_score: 30,
    is_daily: false,
    long_words_count: 0,
    ...overrides,
  };
}

function makePuzzleState(overrides: Partial<SyncPuzzleState> = {}): SyncPuzzleState {
  return {
    puzzle_number: 1,
    found_words: ['kana', 'kala'],
    score: 2,
    hints_unlocked: [],
    started_at: 1000,
    total_paused_ms: 0,
    score_before_hints: null,
    ...overrides,
  };
}

function saveLocalPuzzleState(
  slot: number,
  foundWords: string[],
  score: number,
  scoreBeforeHints: number | null = score,
) {
  saveToStorage(puzzleStateKey(slot), {
    foundWords,
    score,
    hintsUnlocked: [],
    startedAt: 1000,
    totalPausedMs: 0,
    scoreBeforeHints,
  });
}

describe('Player Sync & Reconcile (Web Store)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    useAuthStore.setState({
      isLoggedIn: false,
      playerId: null,
      playerKey: null,
      isLinked: false,
      sessionCount: 1,
      isLoading: false,
      error: null,
    });
  });

  it('gathers local stats and puzzle state for syncing', () => {
    saveToStorage(STATS_STORAGE_KEY, { records: [makeStatRecord()] });
    saveLocalPuzzleState(1, ['kana', 'kala'], 2);

    const gathered = gatherLocalData();
    expect(gathered.stats.records).toHaveLength(1);
    expect(gathered.stats.records[0]?.puzzle_number).toBe(1);
    expect(gathered.puzzle_states).toHaveLength(1);
    expect(gathered.puzzle_states[0]?.found_words).toEqual(['kana', 'kala']);
  });

  it('merges server progress monotonically into local storage without losing progress', () => {
    saveToStorage(STATS_STORAGE_KEY, {
      records: [
        makeStatRecord({
          best_rank: 'Sanavalmis',
          best_score: 50,
          words_found: 8,
          elapsed_ms: 30000,
          pangrams_found: 1,
        }),
      ],
    });
    saveLocalPuzzleState(1, ['kana', 'kukko'], 6);

    let pushedPrefs = false;
    const changed = pullAndMergeData(
      {
        stats: {
          version: 1,
          records: [
            makeStatRecord({ best_rank: 'Hyvä alku', best_score: 20, words_found: 3 }),
            makeStatRecord({
              puzzle_number: 2,
              date: '2026-04-11',
              best_score: 35,
              max_score: 90,
              hints_used: 1,
              elapsed_ms: 45000,
            }),
          ],
        },
        puzzle_states: [
          makePuzzleState({
            found_words: ['kana', 'aasi'],
            score: 7,
            hints_unlocked: ['grid'],
            score_before_hints: 6,
          }),
        ],
      },
      () => {
        pushedPrefs = true;
      },
    );

    expect(changed).toBe(true);
    expect(pushedPrefs).toBe(false);

    const mergedStats = loadFromStorage<{ records: StatsRecord[] }>(STATS_STORAGE_KEY);
    expect(mergedStats?.records).toHaveLength(2);
    expect(mergedStats?.records.find((r) => r.puzzle_number === 1)?.best_score).toBe(50);
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

  it('pushes local records absent or ahead of server on pull via syncProgress', async () => {
    const pushedPayloads: unknown[] = [];

    const localData = {
      stats: {
        version: 1 as const,
        records: [
          makeStatRecord({
            best_rank: 'Sanavalmis',
            best_score: 50,
            words_found: 8,
            pangrams_found: 1,
            is_daily: true,
            played_at_date: '2026-04-10',
          }),
          makeStatRecord({
            puzzle_number: 3,
            date: '2026-04-12',
            best_rank: 'Hyvä alku',
            best_score: 10,
            words_found: 2,
          }),
        ],
      },
      puzzle_states: [
        makePuzzleState({
          found_words: ['aasi', 'kana', 'kukko'],
          score: 7,
          score_before_hints: 7,
        }),
      ],
    };

    const serverPayload = {
      stats: { version: 1 as const, records: [makeStatRecord()] },
      puzzle_states: [makePuzzleState({ found_words: ['aasi', 'kana'] })],
    };

    const res = pushLocalDataAheadOfServer(localData, serverPayload, {
      syncProgress: async (p) => {
        pushedPayloads.push(p);
      },
    });

    expect(res.pushedPuzzles).toBe(2);
    expect(pushedPayloads).toHaveLength(2);
    expect(pushedPayloads[0]).toMatchObject({
      puzzle_number: 1,
      date: '2026-04-10',
      found_words: ['aasi', 'kana', 'kukko'],
      is_daily: true,
      played_at_date: '2026-04-10',
    });
  });

  it('keeps score_before_hints null when pushing offline hintless progress ahead of server', () => {
    const pushedPayloads: Array<{ score_before_hints: number | null; hints_unlocked: string[] }> =
      [];

    const localData = {
      stats: {
        version: 1 as const,
        records: [
          makeStatRecord({
            puzzle_number: 10,
            date: '2026-11-18',
            best_rank: 'Hyvä alku',
            best_score: 1,
            max_score: 150,
            words_found: 1,
            best_no_hint_score: 1,
          }),
        ],
      },
      puzzle_states: [
        makePuzzleState({
          puzzle_number: 10,
          found_words: ['kana'],
          score: 1,
          score_before_hints: null,
        }),
      ],
    };

    const res = pushLocalDataAheadOfServer(
      localData,
      { stats: { version: 1, records: [] }, puzzle_states: [] },
      {
        syncProgress: async (p) => {
          pushedPayloads.push(p);
        },
      },
    );

    expect(res.pushedPuzzles).toBe(1);
    expect(pushedPayloads[0]?.hints_unlocked).toEqual([]);
    expect(pushedPayloads[0]?.score_before_hints).toBeNull();
  });

  it('initializes first-boot player, uploads pre-existing local progress, and persists rotated token', async () => {
    saveToStorage(STATS_STORAGE_KEY, { records: [makeStatRecord()] });
    saveLocalPuzzleState(1, ['kana'], 1);

    const newKey = 'e'.repeat(64);
    vi.spyOn(clientModule, 'postPlayerAuthInit').mockResolvedValueOnce({
      player_key: newKey,
      token: 'init-tok',
      player_id: 77,
    });
    const transferSpy = vi.spyOn(clientModule, 'postPlayerTransferUse').mockResolvedValueOnce({
      token: 'upgraded-tok',
      player_id: 77,
      session_count: 1,
      stats: { version: 1, records: [] },
      puzzle_states: [],
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState()).toMatchObject({
      isLoggedIn: true,
      playerId: 77,
      playerKey: newKey,
      sessionCount: 1,
      isLinked: false,
      isLoading: false,
    });
    expect(loadFromStorage(PLAYER_KEY_STORAGE_KEY)).toBe(newKey);
    expect(loadFromStorage(AUTH_TOKEN_STORAGE_KEY)).toBe('upgraded-tok');
    expect(transferSpy).toHaveBeenCalledWith(
      expect.objectContaining({ token: newKey }),
      'init-tok',
    );
  });

  it('re-initializes cleanly when stored session token is expired and keeps local progress', async () => {
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'expired-tok');
    saveToStorage(STATS_STORAGE_KEY, { records: [makeStatRecord({ puzzle_number: 9 })] });

    vi.spyOn(clientModule, 'fetchPlayerMe').mockResolvedValueOnce(null);
    const freshKey = 'f'.repeat(64);
    vi.spyOn(clientModule, 'postPlayerAuthInit').mockResolvedValueOnce({
      player_key: freshKey,
      token: 'fresh-tok',
      player_id: 88,
    });
    vi.spyOn(clientModule, 'postPlayerTransferUse').mockResolvedValueOnce({
      token: 'fresh-tok-2',
      player_id: 88,
      session_count: 1,
      stats: { version: 1, records: [] },
      puzzle_states: [],
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().playerId).toBe(88);
    expect(loadFromStorage<{ records: StatsRecord[] }>(STATS_STORAGE_KEY)?.records).toHaveLength(1);
    expect(loadFromStorage(AUTH_TOKEN_STORAGE_KEY)).toBe('fresh-tok-2');
  });

  it('reconciles server pull + local-ahead push on initialize and dispatches sync-reload only on change', async () => {
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'valid-tok');
    saveToStorage(STATS_STORAGE_KEY, { records: [makeStatRecord({ puzzle_number: 2 })] });
    saveLocalPuzzleState(2, ['kala'], 1, null);

    vi.spyOn(clientModule, 'fetchPlayerMe').mockResolvedValue({ player_id: 12, session_count: 2 });
    const syncSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    const reloadEvents: Event[] = [];
    window.addEventListener('sanakenno:sync-reload', (e) => reloadEvents.push(e));

    // Server has puzzle 1 (new locally -> changed = true), lacks puzzle 2 (local ahead -> pushed)
    vi.spyOn(clientModule, 'fetchPlayerSync').mockResolvedValueOnce({
      stats: { version: 1, records: [makeStatRecord({ puzzle_number: 1 })] },
      puzzle_states: [makePuzzleState({ puzzle_number: 1 })],
    });

    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState()).toMatchObject({
      isLoggedIn: true,
      playerId: 12,
      sessionCount: 2,
      isLinked: true,
    });
    expect(syncSpy).toHaveBeenCalledWith(
      'valid-tok',
      expect.objectContaining({ puzzle_number: 2, found_words: ['kala'] }),
    );
    expect(reloadEvents).toHaveLength(1);

    // Second boot when server matches local -> no reload event
    vi.spyOn(clientModule, 'fetchPlayerSync').mockResolvedValueOnce({
      stats: {
        version: 1,
        records: [makeStatRecord({ puzzle_number: 2 }), makeStatRecord({ puzzle_number: 1 })],
      },
      puzzle_states: [
        makePuzzleState({ puzzle_number: 2, found_words: ['kala'], score: 1 }),
        makePuzzleState({ puzzle_number: 1 }),
      ],
    });

    await useAuthStore.getState().initialize();
    expect(reloadEvents).toHaveLength(1);
  });

  it('logout preserves local progress by default and wipes when clearLocalProgress: true', async () => {
    saveToStorage(STATS_STORAGE_KEY, { records: [{ puzzle_number: 1 }] });
    saveToStorage(puzzleStateKey(1), { foundWords: ['kana'] });
    saveToStorage('revealed_1', 'true');

    const initSpy = vi.fn().mockResolvedValue(undefined);
    const linkedState = {
      initPlayer: initSpy,
      isLoggedIn: true,
      playerId: 99,
      isLinked: true,
      sessionCount: 2,
    };
    useAuthStore.setState(linkedState);
    await useAuthStore.getState().logout({ clearLocalProgress: false });

    expect(loadFromStorage(STATS_STORAGE_KEY)).toEqual({ records: [{ puzzle_number: 1 }] });
    expect(loadFromStorage(puzzleStateKey(1))).toEqual({ foundWords: ['kana'] });
    expect(useAuthStore.getState().isLinked).toBe(false);
    expect(initSpy).toHaveBeenCalledTimes(1);

    useAuthStore.setState(linkedState);
    await useAuthStore.getState().logout({ clearLocalProgress: true });

    expect(loadFromStorage(STATS_STORAGE_KEY)).toBeNull();
    expect(loadFromStorage(puzzleStateKey(1))).toBeNull();
    expect(window.localStorage.getItem('revealed_1')).toBeNull();
    expect(initSpy).toHaveBeenCalledTimes(2);
  });

  it('refreshSessionCount updates sessionCount and isLinked from /me', async () => {
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'valid-token');
    const mockMe = vi.spyOn(clientModule, 'fetchPlayerMe');
    mockMe.mockResolvedValueOnce({ player_id: 1, session_count: 3 });

    await useAuthStore.getState().refreshSessionCount();
    expect(useAuthStore.getState()).toMatchObject({ sessionCount: 3, isLinked: true });
    expect(loadFromStorage(LINKED_STATE_STORAGE_KEY)).toBe('true');

    mockMe.mockResolvedValueOnce({ player_id: 1, session_count: 1 });
    await useAuthStore.getState().refreshSessionCount();
    expect(useAuthStore.getState()).toMatchObject({ sessionCount: 1, isLinked: false });
    expect(loadFromStorage(LINKED_STATE_STORAGE_KEY)).toBeNull();
  });

  it('useTransfer updates sessionCount, persists 64-hex playerKey, and clears playerKey on PIN', async () => {
    const validKey = 'a'.repeat(64);
    const mockTransfer = vi.spyOn(clientModule, 'postPlayerTransferUse');
    mockTransfer.mockResolvedValueOnce({
      token: 'new-token',
      player_id: 42,
      session_count: 5,
      stats: { version: 1, records: [] },
      puzzle_states: [],
    });

    await useAuthStore.getState().useTransfer(validKey);
    expect(useAuthStore.getState()).toMatchObject({
      sessionCount: 5,
      isLinked: true,
      playerKey: validKey,
    });
    expect(loadFromStorage(PLAYER_KEY_STORAGE_KEY)).toBe(validKey);

    mockTransfer.mockClear();
    await useAuthStore.getState().useTransfer(validKey);
    expect(mockTransfer).not.toHaveBeenCalled();

    mockTransfer.mockResolvedValueOnce({
      token: 'pin-session-token',
      player_id: 7,
      session_count: 2,
      stats: { version: 1, records: [] },
      puzzle_states: [],
    });
    await useAuthStore.getState().useTransfer('123-456');
    expect(useAuthStore.getState().playerKey).toBeNull();
    expect(loadFromStorage(PLAYER_KEY_STORAGE_KEY)).toBeNull();
  });

  it('updates sanakenno_preferences_updated_at and triggers syncPreferences on palette/theme change', () => {
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      syncPreferences: syncSpy,
    } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);

    usePaletteStore.getState().setThemeId('meri');
    expect(loadFromStorage<string>(PREFERENCES_UPDATED_AT_KEY)).toBeTruthy();
    expect(syncSpy).toHaveBeenCalledTimes(1);

    useThemePreferenceStore.getState().setPreference('light');
    expect(loadFromStorage<string>(PREFERENCES_UPDATED_AT_KEY)).toBeTruthy();
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });
});
