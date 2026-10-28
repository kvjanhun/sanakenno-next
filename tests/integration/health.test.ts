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
      days_remaining: 0,
      timezone: 'Europe/Helsinki',
    });
  });

  it('counts only active (is_active = 1) puzzles and reports rotation headroom after seeding', async () => {
    await harness.seed();
    await harness.db
      .insertInto('puzzles')
      .values({
        slot: 3,
        letters: 'a,i,o,p,r,s,t',
        center: 'a',
        is_active: 0,
      })
      .execute();

    const res = await harness.client.api.health.$get();
    const body = await res.json();

    expect(body.total_puzzles).toBe(2);
    expect(body.days_remaining).toBeGreaterThanOrEqual(1);
    expect(body.days_remaining).toBeLessThanOrEqual(2);
  });
});
