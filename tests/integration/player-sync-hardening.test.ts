import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resetEmailRateLimit,
  resetInitPlayerRateLimit,
  resetTransferCreateRateLimit,
} from '../../packages/server/src/features/player-auth/player-auth.routes.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Player Auth & Sync Hardening (Spec 29)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    resetInitPlayerRateLimit();
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    harness = createTestHarness();

    await harness.db
      .insertInto('puzzles')
      .values([{ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 }])
      .execute();
  });

  afterEach(async () => {
    resetInitPlayerRateLimit();
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    await harness.destroy();
  });

  it('enforces sliding-window IP rate limit on POST /api/player/auth/init', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await harness.app.request('/api/player/auth/init', {
        method: 'POST',
        headers: { 'X-Forwarded-For': '203.0.113.55' },
      });
      expect(res.status).toBe(200);
    }

    const blocked = await harness.app.request('/api/player/auth/init', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.55' },
    });
    expect(blocked.status).toBe(429);
  });

  it('allows a device paired via 6-digit PIN to request a transfer email with 200 OK', async () => {
    const initA = await harness.client.api.player.auth.init.$post();
    const playerA = (await initA.json()) as { token: string; player_id: number };

    const ticketRes = await harness.client.api.player.auth.transfer.ticket.$post(
      {},
      { headers: { Authorization: `Bearer ${playerA.token}` } },
    );
    const { code } = (await ticketRes.json()) as { code: string };

    const useRes = await harness.client.api.player.auth.transfer.use.$post({
      json: { token: code },
    });
    expect(useRes.status).toBe(200);
    const deviceB = (await useRes.json()) as { token: string; player_id: number };
    expect(deviceB.player_id).toBe(playerA.player_id);

    // Device B (paired via PIN, no player_key) requests transfer email
    const emailRes = await harness.client.api.player.auth.transfer.create.$post(
      { json: { email: 'pin-device@example.com' } },
      { headers: { Authorization: `Bearer ${deviceB.token}` } },
    );
    expect(emailRes.status).toBe(200);
    expect(await emailRes.json()).toEqual({ status: 'ok' });
  });

  it('strips non-puzzle words and recalculates accurate score on POST /api/player/sync/progress', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string };
    const headers = { Authorization: `Bearer ${player.token}` };

    const res = await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: ['kana', 'kissa', 'forgedword', 'zzzz'],
          score: 9999,
          max_score: 100,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 9999,
          best_no_hint_score: 9999,
        },
      },
      { headers },
    );
    expect(res.status).toBe(200);

    const pullRes = await harness.client.api.player.sync.$get({}, { headers });
    const data = (await pullRes.json()) as {
      puzzle_states: Array<{
        found_words: string[];
        score: number;
        score_before_hints: number | null;
      }>;
      stats: {
        records: Array<{
          best_score: number;
          best_no_hint_score: number;
          words_found: number;
        }>;
      };
    };

    // 'kana' (1 pt) + 'kissa' (5 pts) = 6 pts; forged words and tampered scores stripped/capped
    expect(data.puzzle_states[0]?.found_words.sort()).toEqual(['kana', 'kissa']);
    expect(data.puzzle_states[0]?.score).toBe(6);
    expect(data.puzzle_states[0]?.score_before_hints).toBe(6);
    expect(data.stats.records[0]?.words_found).toBe(2);
    expect(data.stats.records[0]?.best_score).toBe(6);
    expect(data.stats.records[0]?.best_no_hint_score).toBe(6);
  });
});
