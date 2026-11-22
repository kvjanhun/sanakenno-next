import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFullPuzzleBySlot } from '../../packages/server/src/features/puzzle/puzzle.queries.js';
import {
  computePuzzle,
  DEFAULT_SEED_WORDS,
  parseComputedPuzzleData,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Puzzle RPC Anti-Spoiler Lock & Precomputed Payloads', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    // 2026-01-02 12:00 Europe/Helsinki (epoch 2026-01-01 -> day 1 -> slot 2 is today)
    vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));

    harness = await createTestHarness();
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
  });

  afterEach(async () => {
    vi.useRealTimers();
    setWordlist(DEFAULT_SEED_WORDS);
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

    // Rejects pre-epoch date on GET /api/puzzle?date= so it cannot wrap modulo into future slot 3
    const preEpochRes = await harness.app.request('/api/puzzle?date=2025-12-31');
    expect(preEpochRes.status).toBe(400);

    // Clamps minLength >= 4 on GET /api/puzzle/:number/words?minLength=1 so <4-letter words never leak
    const minLenRes = await harness.app.request('/api/puzzle/1/words?minLength=1');
    expect(minLenRes.status).toBe(200);
    const minLenBody = (await minLenRes.json()) as { words: string[] };
    expect(minLenBody.words.every((w) => w.replaceAll('-', '').length >= 4)).toBe(true);
  });

  it('lazily writes through computed_data on first read and serves subsequent reads without touching the wordlist', async () => {
    const beforeRow = await harness.db
      .selectFrom('puzzles')
      .select('computed_data')
      .where('slot', '=', 1)
      .executeTakeFirstOrThrow();
    expect(beforeRow.computed_data).toBeNull();

    // First read computes and writes computed_data back to puzzles
    const first = await getFullPuzzleBySlot(harness.db, 1);
    expect(first?.words).toContain('kana');

    const storedRow = await harness.db
      .selectFrom('puzzles')
      .select(['computed_data', 'max_score'])
      .where('slot', '=', 1)
      .executeTakeFirstOrThrow();
    const parsedStored = parseComputedPuzzleData(storedRow.computed_data);
    expect(parsedStored).not.toBeNull();
    expect(parsedStored?.words).toContain('kana');
    expect(storedRow.max_score).toBe(first?.max_score);

    // Wipe in-memory wordlist completely — reads must still succeed straight from DB computed_data
    setWordlist([]);

    const apiRes = await harness.client.api.puzzle[':number'].$get({ param: { number: '1' } });
    expect(apiRes.status).toBe(200);
    const apiBody = (await apiRes.json()) as {
      word_hashes: string[];
      max_score: number;
      hint_data: { word_count: number };
    };
    expect(apiBody.word_hashes).toEqual(first?.word_hashes);
    expect(apiBody.max_score).toBe(first?.max_score);
    expect(apiBody.hint_data.word_count).toBe(first?.words.length);

    const wordsRes = await harness.client.api.puzzle[':number'].words.$get({
      param: { number: '1' },
    });
    expect(wordsRes.status).toBe(200);
    const wordsBody = (await wordsRes.json()) as { words: string[] };
    expect(wordsBody.words).toContain('kana');
  });

  it('reflects cross-instance computed_data updates immediately on the very next read', async () => {
    const initial = await getFullPuzzleBySlot(harness.db, 1);
    expect(initial?.words).toContain('kana');

    const updatedComputed = computePuzzle('a,e,i,k,l,n,s', 'a', ['kana']);
    await harness.db
      .updateTable('puzzles')
      .set({
        max_score: updatedComputed.max_score,
        computed_data: JSON.stringify(updatedComputed),
      })
      .where('slot', '=', 1)
      .execute();

    // Zero TTL wait or local cache invalidation needed
    const next = await getFullPuzzleBySlot(harness.db, 1);
    expect(next?.words).not.toContain('kana');
    expect(next?.max_score).toBe(updatedComputed.max_score);
  });
});
