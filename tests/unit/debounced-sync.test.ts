import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleResponse, SyncProgressPayload } from '@sanakenno/shared';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';
import { useGameStore } from '../../packages/web/src/features/gameplay/useGameStore.js';
import { AUTH_TOKEN_STORAGE_KEY } from '../../packages/web/src/features/player-sync/sync-reconcile.js';
import { saveToStorage } from '../../packages/web/src/features/gameplay/storage.js';
import * as clientModule from '../../packages/web/src/api/client.js';

describe('Debounced Progress Sync', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    await useAuthStore.getState().flushPendingSync();
  });

  it('coalesces multiple rapid progress updates into a single debounced server call', async () => {
    vi.useFakeTimers();
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();

    // Set auth token in localStorage so store can sync
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'test-bearer-token');

    const payload1: SyncProgressPayload = {
      puzzle_number: 1,
      date: '2026-04-10',
      found_words: ['kana'],
      score: 1,
      max_score: 50,
      hints_unlocked: [],
      started_at: 1000,
      total_paused_ms: 0,
      score_before_hints: 1,
      best_no_hint_score: 1,
    };

    const payload2: SyncProgressPayload = {
      ...payload1,
      found_words: ['kana', 'kissa'],
      score: 3,
      best_no_hint_score: 3,
    };

    // Trigger debounced calls rapidly
    useAuthStore.getState().syncProgressDebounced(payload1);
    useAuthStore.getState().syncProgressDebounced(payload2);

    // Prior to timer expiration, postSyncProgress has not been called
    expect(postSpy).not.toHaveBeenCalled();

    // Advance timer past debounce delay (1200ms)
    await vi.runAllTimersAsync();

    // Exactly one call should have been made with the coalesced latest payload
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('test-bearer-token', payload2);

    vi.useRealTimers();
  });

  it('flushes pending queue immediately when flushPendingSync is invoked', async () => {
    vi.useFakeTimers();
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'test-bearer-token');

    const payload: SyncProgressPayload = {
      puzzle_number: 2,
      date: '2026-04-11',
      found_words: ['suomi'],
      score: 5,
      max_score: 60,
      hints_unlocked: [],
      started_at: 2000,
      total_paused_ms: 0,
      score_before_hints: 5,
      best_no_hint_score: 5,
    };

    useAuthStore.getState().syncProgressDebounced(payload);
    expect(postSpy).not.toHaveBeenCalled();

    // Explicit flush without waiting for timer
    await useAuthStore.getState().flushPendingSync();

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('test-bearer-token', payload);

    // Advancing timer further should not trigger another call
    await vi.runAllTimersAsync();
    expect(postSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('flushes pending sync on document visibilitychange to hidden', async () => {
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'test-bearer-token');

    const payload: SyncProgressPayload = {
      puzzle_number: 3,
      date: '2026-04-12',
      found_words: ['kenno'],
      score: 5,
      max_score: 50,
      hints_unlocked: [],
      started_at: 1000,
      total_paused_ms: 0,
      score_before_hints: 5,
      best_no_hint_score: 5,
    };

    useAuthStore.getState().syncProgressDebounced(payload);
    expect(postSpy).not.toHaveBeenCalled();

    // Mock document.visibilityState to 'hidden' and dispatch event
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Wait for promise resolution
    await Promise.resolve();
    await Promise.resolve();

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('test-bearer-token', payload);

    // Reset visibilityState back to visible
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  it('flushes pending sync when switching puzzles via useGameStore.loadPuzzle', async () => {
    const postSpy = vi.spyOn(clientModule, 'postSyncProgress').mockResolvedValue();
    saveToStorage(AUTH_TOKEN_STORAGE_KEY, 'test-bearer-token');

    const payload: SyncProgressPayload = {
      puzzle_number: 4,
      date: '2026-04-13',
      found_words: ['aasi'],
      score: 2,
      max_score: 40,
      hints_unlocked: [],
      started_at: 1000,
      total_paused_ms: 0,
      score_before_hints: 2,
      best_no_hint_score: 2,
    };

    useAuthStore.getState().syncProgressDebounced(payload);
    expect(postSpy).not.toHaveBeenCalled();

    const mockPuzzle: PuzzleResponse = {
      puzzle_number: 5,
      display_number: 5,
      total_puzzles: 1,
      center: 'a',
      letters: ['k', 'e', 'n', 'o', 's'],
      word_hashes: [],
      max_score: 100,
      hint_data: {
        word_count: 1,
        pangram_count: 0,
        by_letter: { s: 1 },
        by_length: { '4': 1 },
        by_pair: { sa: 1 },
      },
    };

    await useGameStore.getState().loadPuzzle(mockPuzzle);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('test-bearer-token', payload);
  });
});
