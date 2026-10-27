import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('GET /api/health (Kysely + Hono RPC integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(() => {
    harness = createTestHarness();
  });

  afterEach(async () => {
    await harness.destroy();
  });

  it('returns 0 active puzzles on an empty database', async () => {
    const res = await harness.client.api.health.$get();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      engine: 'kysely-sqlite',
      total_puzzles: 0,
      timezone: 'Europe/Helsinki',
    });
  });

  it('counts only non-deleted puzzles after seeding', async () => {
    await harness.seed();
    await harness.db
      .insertInto('puzzles')
      .values({
        letters: 'AITOPRS',
        center_letter: 'A',
        words: JSON.stringify(['AITA']),
        max_score: 4,
        pangrams: JSON.stringify([]),
        hint_data: null,
        deleted_at: '2026-05-01T00:00:00Z',
      })
      .execute();

    const res = await harness.client.api.health.$get();
    const body = await res.json();

    expect(body.total_puzzles).toBe(2);
  });
});
