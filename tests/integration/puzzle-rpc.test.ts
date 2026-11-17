import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SEED_WORDS,
  invalidatePuzzleCache,
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
});
