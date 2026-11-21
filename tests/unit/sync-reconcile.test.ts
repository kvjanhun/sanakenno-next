// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as clientModule from '../../packages/web/src/api/client.js';
import {
  isPuzzleRevealed,
  loadFromStorage,
  puzzleStateKey,
  revealedKey,
  saveToStorage,
  setRawStorage,
  type PersistedPuzzleState,
} from '../../packages/web/src/features/gameplay/storage.js';
import {
  AUTH_TOKEN_STORAGE_KEY,
  gatherLocalData,
  pullAndMergeData,
  pushLocalDataAheadOfServer,
} from '../../packages/web/src/features/player-sync/sync-reconcile.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';

describe('sync-reconcile active elapsed_ms rebasing', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('rebases totalPausedMs when hydrating a remote puzzle state onto a fresh device hours later', () => {
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    const activeElapsedMs = 45_000;
    const startedAt = now - sixHoursMs - activeElapsedMs;

    const changed = pullAndMergeData(
      {
        stats: {
          version: 1,
          records: [
            {
              puzzle_number: 70,
              date: '2026-11-21',
              best_rank: 'Hyvä alku',
              best_score: 5,
              max_score: 100,
              words_found: 2,
              hints_used: 0,
              elapsed_ms: activeElapsedMs,
            },
          ],
        },
        puzzle_states: [
          {
            puzzle_number: 70,
            found_words: ['kana', 'kala'],
            score: 5,
            hints_unlocked: [],
            started_at: startedAt,
            total_paused_ms: 0,
            score_before_hints: null,
          },
        ],
      },
      vi.fn(),
    );

    expect(changed).toBe(true);
    const persisted = loadFromStorage<PersistedPuzzleState>(puzzleStateKey(70));
    expect(persisted).not.toBeNull();
    expect(persisted?.lastActiveAt).toBeDefined();
    const effectiveElapsedMs = now - (persisted?.startedAt ?? 0) - (persisted?.totalPausedMs ?? 0);
    expect(effectiveElapsedMs).toBeLessThanOrEqual(activeElapsedMs + 1000);
    expect(effectiveElapsedMs).toBeGreaterThanOrEqual(activeElapsedMs - 1000);
  });

  it('round-trips revealed_<slot> for unplayed puzzles across gatherLocalData, pushLocalDataAheadOfServer, pullAndMergeData, and syncRevealedPuzzle', async () => {
    setRawStorage(revealedKey(88), 'true');

    const gathered = gatherLocalData();
    expect(gathered.puzzle_states).toHaveLength(1);
    expect(gathered.puzzle_states[0]).toMatchObject({
      puzzle_number: 88,
      found_words: [],
      revealed: true,
    });

    const pushed: unknown[] = [];
    const { pushedPuzzles } = pushLocalDataAheadOfServer(
      gathered,
      { stats: { version: 1, records: [] }, puzzle_states: [] },
      {
        syncProgress: async (payload) => {
          pushed.push(payload);
        },
      },
    );
    expect(pushedPuzzles).toBe(1);
    expect(pushed[0]).toMatchObject({ puzzle_number: 88, revealed: true });

    // Pull onto a clean device sets revealed_<slot> = 'true'
    window.localStorage.clear();
    const changed = pullAndMergeData(
      {
        stats: { version: 1, records: [] },
        puzzle_states: [
          {
            puzzle_number: 89,
            found_words: [],
            score: 0,
            hints_unlocked: [],
            started_at: 0,
            total_paused_ms: 0,
            score_before_hints: null,
            revealed: true,
          },
        ],
      },
      vi.fn(),
    );
    expect(changed).toBe(true);
    expect(isPuzzleRevealed(89)).toBe(true);

    // syncRevealedPuzzle pushes revealed: true when logged in
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'tok-reveal');
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    await useAuthStore.getState().syncRevealedPuzzle(90);
    expect(postSpy).toHaveBeenCalledWith(
      'tok-reveal',
      expect.objectContaining({
        puzzle_number: 90,
        revealed: true,
        found_words: [],
      }),
    );
    postSpy.mockRestore();
  });
});
