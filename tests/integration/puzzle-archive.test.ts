import { getHelsinkiDateString } from '@sanakenno/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveSlots,
  getDaysRemainingInCycle,
  getDisplayNumber,
  getFullPuzzleForDate,
  getSlotByDisplayNumber,
  nextFreeSlot,
  totalPuzzles,
} from '../../packages/server/src/features/puzzle/puzzle.queries.js';
import {
  bumpPuzzleCacheGeneration,
  DEFAULT_SEED_WORDS,
  getCachedPuzzle,
  getPuzzleCacheSize,
  invalidatePuzzleCache,
  MAX_PUZZLE_CACHE_SIZE,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Daily Puzzle & Archive RPC (Kysely + Hono integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Fix time to 2026-01-03 12:00:00 Europe/Helsinki (UTC+2)
    vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));

    harness = createTestHarness();
    setWordlist(DEFAULT_SEED_WORDS);

    await harness.db
      .insertInto('puzzles')
      .values([
        { slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 },
        { slot: 2, letters: 'e,h,i,k,n,o,s', center: 'n', is_active: 1 },
        { slot: 3, letters: 'a,e,i,k,l,n,s', center: 'k', is_active: 1 },
        { slot: 4, letters: 'e,h,i,k,n,o,s', center: 'k', is_active: 1 },
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

  describe('slot vs display_number separation across soft-deleted gaps', () => {
    it('closes display_number gaps when a puzzle slot is soft-deleted and preserves permanent slot keys', async () => {
      // Soft-delete slot 2
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();
      // Also soft-delete highest slot 4 to verify nextFreeSlot never reuses it
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 4).execute();
      bumpPuzzleCacheGeneration();

      expect(await getActiveSlots(harness.db)).toEqual([1, 3]);
      expect(await totalPuzzles(harness.db)).toBe(2);
      expect(await nextFreeSlot(harness.db)).toBe(5);

      expect(await getDisplayNumber(harness.db, 1)).toBe(1);
      expect(await getDisplayNumber(harness.db, 2)).toBeNull();
      expect(await getDisplayNumber(harness.db, 3)).toBe(2);
      expect(await getDisplayNumber(harness.db, 4)).toBeNull();

      expect(await getSlotByDisplayNumber(harness.db, 1)).toBe(1);
      expect(await getSlotByDisplayNumber(harness.db, 2)).toBe(3);
      expect(await getSlotByDisplayNumber(harness.db, 3)).toBeNull();

      // GET /api/puzzle/3 returns permanent puzzle_number = 3 but display_number = 2
      const resSlot3 = await harness.client.api.puzzle[':number'].$get({
        param: { number: '3' },
      });
      expect(resSlot3.status).toBe(200);
      if (resSlot3.status !== 200) throw new Error('Expected 200');
      const bodySlot3 = await resSlot3.json();
      expect(bodySlot3.puzzle_number).toBe(3);
      expect(bodySlot3.display_number).toBe(2);
      expect(bodySlot3.total_puzzles).toBe(2);

      // Soft-deleted slot 2 returns 404
      const resSlot2 = await harness.client.api.puzzle[':number'].$get({
        param: { number: '2' },
      });
      expect(resSlot2.status).toBe(404);
    });
  });

  describe('Europe/Helsinki date rotation & ?date= query handling', () => {
    it('rotates sequentially across active slots and skips soft-deleted slots without duplicate days', async () => {
      // Soft-delete slot 2 so active slots are [1, 3, 4]
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();
      invalidatePuzzleCache();

      // epoch 2026-01-01 -> index 0 -> slot 1 (display 1)
      // 2026-01-02 -> index 1 -> slot 3 (display 2)
      // 2026-01-03 (today) -> index 2 -> slot 4 (display 3)
      const p1 = await getFullPuzzleForDate(harness.db, '2026-01-01');
      const p2 = await getFullPuzzleForDate(harness.db, '2026-01-02');
      const p3 = await getFullPuzzleForDate(harness.db, '2026-01-03');
      // 2025-12-31 (1 day before epoch) wraps to last active slot 4
      const pPrev = await getFullPuzzleForDate(harness.db, '2025-12-31');

      expect(p1?.slot).toBe(1);
      expect(p1?.display_number).toBe(1);
      expect(p2?.slot).toBe(3);
      expect(p2?.display_number).toBe(2);
      expect(p3?.slot).toBe(4);
      expect(p3?.display_number).toBe(3);
      expect(pPrev?.slot).toBe(4);
    });

    it('serves today puzzle by default, honors valid past ?date=, and rejects future or malformed dates', async () => {
      expect(getHelsinkiDateString()).toBe('2026-01-03');

      const todayRes = await harness.client.api.puzzle.$get();
      expect(todayRes.status).toBe(200);
      if (todayRes.status !== 200) throw new Error('Expected 200');
      const todayBody = await todayRes.json();
      expect(todayBody.puzzle_number).toBe(3);

      const pastRes = await harness.app.request('/api/puzzle?date=2026-01-01');
      expect(pastRes.status).toBe(200);
      const pastBody = (await pastRes.json()) as { puzzle_number: number };
      expect(pastBody.puzzle_number).toBe(1);

      const futureRes = await harness.app.request('/api/puzzle?date=2026-01-04');
      expect(futureRes.status).toBe(400);

      const invalidRes = await harness.app.request('/api/puzzle?date=2026-02-31');
      expect(invalidRes.status).toBe(400);
    });

    it('computes days_remaining in GET /api/health from cycle position rather than slot numbers', async () => {
      // Soft-delete slot 2 -> active slots are [1, 3, 4] (3 active puzzles)
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();

      // Today is 2026-01-03 -> day 2 -> index 2 (slot 4, last active puzzle in cycle) -> 1 day remaining
      expect(await getDaysRemainingInCycle(harness.db, '2026-01-03')).toBe(1);
      const healthLastDay = await (await harness.client.api.health.$get()).json();
      expect(healthLastDay.days_remaining).toBe(1);
      expect(healthLastDay.total_puzzles).toBe(3);

      // Advance to rollover day 2026-01-04 -> index 0 (slot 1) -> full cycle of 3 days remaining
      vi.setSystemTime(new Date('2026-01-04T10:00:00Z'));
      const healthRollover = await (await harness.client.api.health.$get()).json();
      expect(healthRollover.days_remaining).toBe(3);
    });
  });

  describe('anti-spoiler protection on GET /api/puzzle/:number/words', () => {
    it('blocks today active puzzle slot with 403 and serves past active puzzle words with 200', async () => {
      // Today (2026-01-03) resolves to slot 3
      const spoilerRes = await harness.client.api.puzzle[':number'].words.$get({
        param: { number: '3' },
      });
      expect(spoilerRes.status).toBe(403);

      // Past puzzle slot 1 is allowed
      const pastWordsRes = await harness.client.api.puzzle[':number'].words.$get({
        param: { number: '1' },
      });
      expect(pastWordsRes.status).toBe(200);
      if (pastWordsRes.status !== 200) throw new Error('Expected 200');
      const pastWordsBody = await pastWordsRes.json();
      expect(pastWordsBody.puzzle_number).toBe(1);
      expect(pastWordsBody.display_number).toBe(1);
      expect(pastWordsBody.center).toBe('a');
      expect(pastWordsBody.words).toContain('kansallinen');
      expect(pastWordsBody.max_score).toBeGreaterThan(0);

      // Supports pangramOnly filter
      const pangramRes = await harness.app.request('/api/puzzle/1/words?pangramOnly=true');
      expect(pangramRes.status).toBe(200);
      const pangramBody = (await pangramRes.json()) as { words: string[] };
      expect(pangramBody.words).toEqual(['kansallinen']);
    });

    it('returns 404 for soft-deleted or out-of-range slots and 400 for non-numeric params', async () => {
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();

      const deletedRes = await harness.client.api.puzzle[':number'].words.$get({
        param: { number: '2' },
      });
      expect(deletedRes.status).toBe(404);

      const missingRes = await harness.client.api.puzzle[':number'].words.$get({
        param: { number: '99' },
      });
      expect(missingRes.status).toBe(404);

      const badParamRes = await harness.client.api.puzzle[':number'].words.$get({
        param: { number: 'abc' },
      });
      expect(badParamRes.status).toBe(400);
    });
  });

  describe('GET /api/archive (7-day window and ?all=true cycle walk)', () => {
    it('returns 7 newest-first entries by default with exactly one is_today entry', async () => {
      const res = await harness.client.api.archive.$get();
      expect(res.status).toBe(200);
      const entries = await res.json();

      expect(entries).toHaveLength(7);
      expect(entries[0]?.date).toBe('2026-01-03');
      expect(entries[0]?.is_today).toBe(true);
      expect(entries[0]?.letters).toHaveLength(7);
      expect(entries[0]?.letters[0]).toBe(entries[0]?.center);
      expect(entries[6]?.date).toBe('2025-12-28');
      expect(entries.filter((e) => e.is_today)).toHaveLength(1);
    });

    it('walks the active cycle by cycle position on ?all=true and skips soft-deleted slots', async () => {
      // Soft-delete slot 2 so active slots are [1, 3, 4]
      await harness.db.updateTable('puzzles').set({ is_active: 0 }).where('slot', '=', 2).execute();
      invalidatePuzzleCache();

      // Today (2026-01-03) is at active cycle index 2 (slot 4) -> ?all=true returns 3 entries (slots 4, 3, 1)
      const resMidCycle = await harness.app.request('/api/archive?all=true');
      expect(resMidCycle.status).toBe(200);
      const midEntries = (await resMidCycle.json()) as Array<{
        date: string;
        puzzle_number: number;
        display_number: number;
      }>;
      expect(midEntries.map((e) => e.puzzle_number)).toEqual([4, 3, 1]);
      expect(midEntries.map((e) => e.display_number)).toEqual([3, 2, 1]);

      // On rollover day (2026-01-04), today is at active cycle index 0 (slot 1) -> returns full 3-puzzle cycle
      vi.setSystemTime(new Date('2026-01-04T10:00:00Z'));
      const resCycleStart = await harness.app.request('/api/archive?all=true');
      const startEntries = (await resCycleStart.json()) as Array<{ puzzle_number: number }>;
      expect(startEntries.map((e) => e.puzzle_number)).toEqual([1, 4, 3]);
    });

    it('returns archive entries with max_score and does NOT populate _puzzleCache', async () => {
      invalidatePuzzleCache();
      expect(getPuzzleCacheSize()).toBe(0);

      const res = await harness.app.request('/api/archive?all=true');
      expect(res.status).toBe(200);
      const entries = (await res.json()) as Array<{
        puzzle_number: number;
        max_score: number;
      }>;

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.max_score).toBeGreaterThan(0);
      }

      // Archive batch querying must NOT populate or pollute _puzzleCache with historical games
      expect(getPuzzleCacheSize()).toBe(0);
    });

    it('bounds _puzzleCache to MAX_PUZZLE_CACHE_SIZE using LRU eviction', async () => {
      invalidatePuzzleCache();

      // Seed 15 active puzzle slots
      for (let s = 10; s <= 24; s++) {
        await harness.db
          .insertInto('puzzles')
          .values({
            slot: s,
            letters: 'a,e,i,k,l,n,s',
            center: 'a',
            is_active: 1,
            max_score: 100,
          })
          .execute();
      }

      // Request each puzzle from 10 to 24 sequentially to load them into cache
      for (let s = 10; s <= 24; s++) {
        const res = await harness.client.api.puzzle[':number'].$get({
          param: { number: String(s) },
        });
        expect(res.status).toBe(200);
      }

      // Cache size must never exceed MAX_PUZZLE_CACHE_SIZE (10)
      expect(getPuzzleCacheSize()).toBe(MAX_PUZZLE_CACHE_SIZE);

      // Oldest slots (10..14) should have been evicted
      expect(getCachedPuzzle(10)).toBeUndefined();
      expect(getCachedPuzzle(11)).toBeUndefined();
      expect(getCachedPuzzle(14)).toBeUndefined();

      // Recent slots (15..24) must remain in cache
      expect(getCachedPuzzle(24)).toBeDefined();
      expect(getCachedPuzzle(20)).toBeDefined();
    });
  });
});
