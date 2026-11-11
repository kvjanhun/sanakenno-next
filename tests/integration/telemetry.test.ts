import type { RankName } from '@sanakenno/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetTelemetryRateLimits } from '../../packages/server/src/features/telemetry/telemetry.routes.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Public Telemetry Endpoints (Kysely + Hono integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    resetTelemetryRateLimits();
    harness = createTestHarness();
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

    it('rejects failed guesses with future dates', async () => {
      const res = await harness.client.api['failed-guess'].$post({
        json: { word: 'kissa', date: '2099-01-01' },
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid date');
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

    it('rejects invalid puzzle_number or word', async () => {
      const res = await harness.client.api['word-find'].$post({
        json: { word: '', puzzle_number: -1 },
      });
      expect(res.status).toBe(400);
    });
  });
});
