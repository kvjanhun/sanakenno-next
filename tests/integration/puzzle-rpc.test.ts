import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFullPuzzleBySlot } from '../../packages/server/src/features/puzzle/puzzle.queries.js';
import {
  DEFAULT_PUZZLE_CACHE_TTL_MS,
  DEFAULT_SEED_WORDS,
  getCachedPuzzle,
  getPuzzleCacheSize,
  invalidatePuzzleCache,
  setPuzzleCacheTtlMs,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Puzzle RPC Anti-Spoiler Lock (Spec 29)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    vi.useFakeTimers();
    // 2026-01-02 12:00 Europe/Helsinki (epoch 2026-01-01 -> day 1 -> slot 2 is today)
    vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));

    harness = createTestHarness();
    setWordlist(DEFAULT_SEED_WORDS);

    await harness.db
      .insertInto('puzzles')
      .values([
        { slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 },
        { slot: 2, letters: 'e,h,i,k,n,o,s', center: 'n', is_active: 1 },
        { slot: 3, letters: 'a,e,i,k,l,n,s', center: 'k', is_active: 1 },
      ])
      .execute();

    await harness.db
      .insertInto('config')
      .values({ key: 'epoch_date', value: '2026-01-01' })
      .execute();

    invalidatePuzzleCache();
  });

  afterEach(async () => {
    vi.useRealTimers();
    setPuzzleCacheTtlMs(DEFAULT_PUZZLE_CACHE_TTL_MS);
    invalidatePuzzleCache();
    await harness.destroy();
  });

  it('allows GET /api/puzzle/:number for past and today slots and returns 403 for future slots', async () => {
    // Slot 1 appeared on 2026-01-01 (past)
    const pastRes = await harness.client.api.puzzle[':number'].$get({ param: { number: '1' } });
    expect(pastRes.status).toBe(200);

    // Slot 2 is today (2026-01-02)
    const todayRes = await harness.client.api.puzzle[':number'].$get({ param: { number: '2' } });
    expect(todayRes.status).toBe(200);

    // Slot 3 is scheduled for 2026-01-03 (future)
    const futureRes = await harness.client.api.puzzle[':number'].$get({ param: { number: '3' } });
    expect(futureRes.status).toBe(403);
    expect(await futureRes.json()).toEqual({ error: 'Future puzzles are not available' });
  });

  it('allows GET /api/puzzle/:number/words for past slots and returns 403 for today and future slots', async () => {
    const pastWords = await harness.client.api.puzzle[':number'].words.$get({
      param: { number: '1' },
    });
    expect(pastWords.status).toBe(200);

    const todayWords = await harness.client.api.puzzle[':number'].words.$get({
      param: { number: '2' },
    });
    expect(todayWords.status).toBe(403);

    const futureWords = await harness.client.api.puzzle[':number'].words.$get({
      param: { number: '3' },
    });
    expect(futureWords.status).toBe(403);
  });

  it('recomputes cached puzzle immediately when letters or center change in DB without local invalidation', async () => {
    const first = await getFullPuzzleBySlot(harness.db, 1);
    expect(first?.center).toBe('a');
    expect(first?.words).toContain('kana');

    // Simulate cross-instance admin edit directly in DB without calling invalidatePuzzleCache()
    await harness.db
      .updateTable('puzzles')
      .set({ letters: 'e,h,i,k,n,o,s', center: 'n' })
      .where('slot', '=', 1)
      .execute();

    const updated = await getFullPuzzleBySlot(harness.db, 1);
    expect(updated?.center).toBe('n');
    expect(updated?.words).toContain('kenno');
    expect(updated?.words).not.toContain('kana');
  });

  it('expires cached puzzles after TTL so cross-instance blocked_words updates propagate automatically', async () => {
    setPuzzleCacheTtlMs(60_000);
    const before = await getFullPuzzleBySlot(harness.db, 1);
    expect(before?.words).toContain('kana');

    // Simulate cross-instance blocked_words insert without calling invalidatePuzzleCache()
    await harness.db.insertInto('blocked_words').values({ word: 'kana' }).execute();

    // Still cached before TTL expires
    const stillCached = await getFullPuzzleBySlot(harness.db, 1);
    expect(stillCached?.words).toContain('kana');

    // Advance past TTL -> cache entry expires and recomputes against DB blocked_words
    vi.advanceTimersByTime(60_001);
    const afterExpiry = await getFullPuzzleBySlot(harness.db, 1);
    expect(afterExpiry?.words).not.toContain('kana');
  });

  it('does not wipe _puzzleCache when getFullPuzzleBySlot is called inside a Kysely transaction', async () => {
    const slot1 = await getFullPuzzleBySlot(harness.db, 1);
    const slot2 = await getFullPuzzleBySlot(harness.db, 2);
    expect(slot1).not.toBeNull();
    expect(slot2).not.toBeNull();
    expect(getPuzzleCacheSize()).toBe(2);

    await harness.db.transaction().execute(async (trx) => {
      const inTx = await getFullPuzzleBySlot(trx, 1);
      expect(inTx?.slot).toBe(1);
    });

    // Neither slot 1 nor slot 2 was wiped by the transaction handle
    expect(getPuzzleCacheSize()).toBe(2);
    expect(getCachedPuzzle(1)).toBeDefined();
    expect(getCachedPuzzle(2)).toBeDefined();
  });
});
