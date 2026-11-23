import { getHelsinkiDateString, type RankName } from '@sanakenno/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../packages/server/src/app.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { resetTelemetryRateLimits } from '../../packages/server/src/features/telemetry/telemetry.routes.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Public Telemetry Endpoints (Kysely + Hono integration)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeEach(async () => {
    resetTelemetryRateLimits();
    setWordlist([...DEFAULT_SEED_WORDS, 'kissa']);
    harness = await createTestHarness();
    await harness.db
      .insertInto('puzzles')
      .values([
        { slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 },
        { slot: 2, letters: 'e,h,i,k,n,o,s', center: 'n', is_active: 0 },
      ])
      .execute();
  });

  afterEach(async () => {
    resetTelemetryRateLimits();
    setWordlist(DEFAULT_SEED_WORDS);
    await harness.destroy();
  });

  describe('POST /api/achievement', () => {
    it('records an achievement for an active puzzle slot', async () => {
      const res = await harness.client.api.achievement.$post({
        json: {
          puzzle_number: 1,
          rank: 'Onnistuja',
          score: 25,
          max_score: 100,
          words_found: 6,
          elapsed_ms: 45000,
          session_id: 'test-session',
        },
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe('recorded');

      const rows = await harness.db
        .selectFrom('achievements')
        .selectAll()
        .where('puzzle_number', '=', 1)
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rank).toBe('Onnistuja');
      expect(rows[0]?.score).toBe(25);
    });

    it('rejects achievements for inactive or non-existent puzzle slots with 404', async () => {
      const res = await harness.client.api.achievement.$post({
        json: {
          puzzle_number: 2, // inactive
          rank: 'Onnistuja',
          score: 25,
          max_score: 100,
          words_found: 6,
        },
      });
      expect(res.status).toBe(404);
    });

    it('rejects invalid ranks or malformed payloads with 400', async () => {
      const res = await harness.client.api.achievement.$post({
        json: {
          puzzle_number: 1,
          rank: 'NotARank' as unknown as RankName,
          score: 25,
          max_score: 100,
          words_found: 6,
        },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/failed-guess', () => {
    it('records a failed guess and increments count on duplicate', async () => {
      const res1 = await harness.client.api['failed-guess'].$post({
        json: { word: 'kasas', date: '2026-04-10' },
      });
      expect(res1.status).toBe(200);

      const res2 = await harness.client.api['failed-guess'].$post({
        json: { word: 'kasas', date: '2026-04-10' },
      });
      expect(res2.status).toBe(200);

      const row = await harness.db
        .selectFrom('failed_guesses')
        .selectAll()
        .where('word', '=', 'kasas')
        .where('puzzle_date', '=', '2026-04-10')
        .executeTakeFirst();
      expect(row?.count).toBe(2);
    });

    it('rejects failed guesses that are actually on the puzzle solution list', async () => {
      const res = await harness.client.api['failed-guess'].$post({
        json: { word: 'kissa', date: '2026-04-10' },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Sana on jo ratkaisulistalla');
    });

    it('rejects words longer than 20 characters', async () => {
      const res = await harness.client.api['failed-guess'].$post({
        json: { word: 'a'.repeat(21), date: '2026-04-10' },
      });
      expect(res.status).toBe(400);
    });

    it('rejects failed guesses with future, pre-epoch, or invalid calendar dates', async () => {
      await harness.db
        .insertInto('config')
        .values({ key: 'epoch_date', value: '2026-01-01' })
        .execute();

      const futureRes = await harness.client.api['failed-guess'].$post({
        json: { word: 'kissa', date: '2099-01-01' },
      });
      expect(futureRes.status).toBe(400);
      expect(await futureRes.json()).toEqual({ error: 'Invalid date' });

      const invalidCalendarRes = await harness.client.api['failed-guess'].$post({
        json: { word: 'kissa', date: '2026-02-31' },
      });
      expect(invalidCalendarRes.status).toBe(400);
      expect(await invalidCalendarRes.json()).toEqual({ error: 'Invalid date' });

      const preEpochRes = await harness.client.api['failed-guess'].$post({
        json: { word: 'kissa', date: '2025-12-31' },
      });
      expect(preEpochRes.status).toBe(400);
      expect(await preEpochRes.json()).toEqual({ error: 'Invalid date' });
    });

    it('rejects words missing center letter or with illegal letters', async () => {
      // Missing center 'a'
      const res1 = await harness.client.api['failed-guess'].$post({
        json: { word: 'eli', date: '2026-04-10' },
      });
      expect(res1.status).toBe(400);

      // Contains letters not in puzzle (e.g. 'o')
      const res2 = await harness.client.api['failed-guess'].$post({
        json: { word: 'koira', date: '2026-04-10' },
      });
      expect(res2.status).toBe(400);
    });
  });

  describe('POST /api/word-find', () => {
    it('records a word find and increments count on duplicate', async () => {
      const res1 = await harness.client.api['word-find'].$post({
        json: { word: 'kana', puzzle_number: 1 },
      });
      expect(res1.status).toBe(200);

      const res2 = await harness.client.api['word-find'].$post({
        json: { word: 'kana', puzzle_number: 1 },
      });
      expect(res2.status).toBe(200);

      const row = await harness.db
        .selectFrom('word_finds')
        .selectAll()
        .where('word', '=', 'kana')
        .where('puzzle_number', '=', 1)
        .executeTakeFirst();
      expect(row?.count).toBe(2);
    });

    it('rejects word not present in puzzle solution list', async () => {
      const res = await harness.client.api['word-find'].$post({
        json: { word: 'kenno', puzzle_number: 1 },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Sana ei kuulu peliin');
    });

    it('rejects inactive slot with exact Finnish 400 error without redundant active-slot pre-check', async () => {
      let queries = 0;
      const countedDb = harness.db.withPlugin({
        transformQuery(args) {
          queries += 1;
          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      });
      const countedApp = createApp(countedDb);

      const inactiveRes = await countedApp.request('/api/word-find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: 'kenno', puzzle_number: 2 }),
      });
      expect(inactiveRes.status).toBe(400);
      expect(await inactiveRes.json()).toEqual({
        error: 'Valittua peliä ei löydy tai se ei ole aktiivinen',
      });
      // Only getSlotScheduleInfo's 2 parallel reads (activeSlots + epochDate); no extra puzzle queries
      expect(queries).toBe(2);
    });

    it('rejects future puzzle slots on POST /api/word-find with 403 to prevent word-membership oracle', async () => {
      await harness.db
        .insertInto('puzzles')
        .values([
          { slot: 3, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 },
          { slot: 4, letters: 'a,e,i,k,l,n,s', center: 'k', is_active: 1 },
        ])
        .execute();
      await harness.db
        .insertInto('config')
        .values({ key: 'epoch_date', value: getHelsinkiDateString() })
        .execute();

      // With epoch_date set to today in Helsinki (epoch day 0 -> slot 1 is today), slot 4 is in the future
      const futureRes = await harness.client.api['word-find'].$post({
        json: { word: 'kana', puzzle_number: 4 },
      });
      expect(futureRes.status).toBe(403);
    });

    it('rejects invalid puzzle_number or word', async () => {
      const res = await harness.client.api['word-find'].$post({
        json: { word: '', puzzle_number: -1 },
      });
      expect(res.status).toBe(400);
    });

    it('prevents invalid Bearer tokens from bypassing IP rate limiting on /api/word-find', async () => {
      for (let i = 0; i < 60; i++) {
        const res = await harness.app.request('/api/word-find', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '203.0.113.77',
            Authorization: `Bearer forged-token-${i}`,
          },
          body: JSON.stringify({ word: 'kana', puzzle_number: 1 }),
        });
        expect(res.status).toBe(200);
      }

      const blockedRes = await harness.app.request('/api/word-find', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.77',
          Authorization: 'Bearer forged-token-bypass-attempt',
        },
        body: JSON.stringify({ word: 'kana', puzzle_number: 1 }),
      });
      expect(blockedRes.status).toBe(429);
    });
  });
});
