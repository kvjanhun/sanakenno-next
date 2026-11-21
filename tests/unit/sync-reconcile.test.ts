// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadFromStorage,
  puzzleStateKey,
  type PersistedPuzzleState,
} from '../../packages/web/src/features/gameplay/storage.js';
import { pullAndMergeData } from '../../packages/web/src/features/player-sync/sync-reconcile.js';

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
});
