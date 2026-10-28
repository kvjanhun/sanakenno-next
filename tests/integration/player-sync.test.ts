import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resetEmailRateLimit,
  resetTransferCreateRateLimit,
} from '../../packages/server/src/features/player-auth/player-auth.routes.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('Player Auth & Cross-Device Sync (Kysely + Hono integration)', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    harness = createTestHarness();

    await harness.db
      .insertInto('puzzles')
      .values([
        { slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 },
        { slot: 2, letters: 'e,h,i,k,n,o,s', center: 'n', is_active: 1 },
      ])
      .execute();
  });

  afterEach(async () => {
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    await harness.destroy();
  });

  async function createPlayer() {
    const res = await harness.client.api.player.auth.init.$post();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      player_key: string;
      token: string;
      player_id: number;
    };
    return data;
  }

  describe('Silent player init & session management', () => {
    it('creates a unique player with SHA-256 hashed player key and valid Bearer session', async () => {
      const player = await createPlayer();
      expect(player.player_id).toBeGreaterThan(0);
      expect(player.player_key).toMatch(/^[0-9a-f]{64}$/);
      expect(player.token).toMatch(/^[0-9a-f]{64}$/);

      const dbPlayer = await harness.db
        .selectFrom('players')
        .selectAll()
        .where('id', '=', player.player_id)
        .executeTakeFirst();
      expect(dbPlayer?.player_key_hash).toBe(sha256(player.player_key));

      // Check /api/player/me with Bearer token
      const meRes = await harness.client.api.player.me.$get(
        {},
        { headers: { Authorization: `Bearer ${player.token}` } },
      );
      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as { player_id: number };
      expect(meData.player_id).toBe(player.player_id);
    });

    it('rejects unauthorized requests with 401', async () => {
      const res = await harness.client.api.player.me.$get({}, { headers: {} });
      expect(res.status).toBe(401);
    });

    it('rejects expired Bearer sessions with 401', async () => {
      const player = await createPlayer();
      const expiredToken = 'c'.repeat(64);
      await harness.db
        .insertInto('player_sessions')
        .values({
          id: expiredToken,
          player_id: player.player_id,
          expires_at: new Date(Date.now() - 5000).toISOString(),
        })
        .execute();

      const res = await harness.client.api.player.me.$get(
        {},
        { headers: { Authorization: `Bearer ${expiredToken}` } },
      );
      expect(res.status).toBe(401);
    });

    it('rotates player key and preserves current session while invalidating other sessions', async () => {
      const player = await createPlayer();

      // Create an auxiliary session for the same player
      const auxToken = 'b'.repeat(64);
      await harness.db
        .insertInto('player_sessions')
        .values({
          id: auxToken,
          player_id: player.player_id,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        })
        .execute();

      const rotateRes = await harness.client.api.player.auth.rotate.$post(
        {},
        { headers: { Authorization: `Bearer ${player.token}` } },
      );
      expect(rotateRes.status).toBe(200);
      const rotateData = (await rotateRes.json()) as { player_key: string };
      expect(rotateData.player_key).not.toBe(player.player_key);

      // Current session still works
      const meRes = await harness.client.api.player.me.$get(
        {},
        { headers: { Authorization: `Bearer ${player.token}` } },
      );
      expect(meRes.status).toBe(200);

      // Auxiliary session was invalidated
      const auxMeRes = await harness.client.api.player.me.$get(
        {},
        { headers: { Authorization: `Bearer ${auxToken}` } },
      );
      expect(auxMeRes.status).toBe(401);
    });

    it('logs out and deletes active session', async () => {
      const player = await createPlayer();
      const logoutRes = await harness.client.api.player.auth.logout.$post(
        {},
        { headers: { Authorization: `Bearer ${player.token}` } },
      );
      expect(logoutRes.status).toBe(200);

      const meRes = await harness.client.api.player.me.$get(
        {},
        { headers: { Authorization: `Bearer ${player.token}` } },
      );
      expect(meRes.status).toBe(401);
    });
  });

  describe('Device pairing transfer links', () => {
    it('uses a transfer player_key on a second device and bulk-merges local state', async () => {
      const originalPlayer = await createPlayer();

      // Second client connects with originalPlayer's player_key and merges initial local data
      const res = await harness.client.api.player.auth.transfer.use.$post({
        json: {
          token: originalPlayer.player_key,
          stats: {
            records: [
              {
                puzzle_number: 1,
                date: '2026-04-10',
                best_rank: 'Onnistuja',
                best_score: 40,
                max_score: 100,
                words_found: 8,
                hints_used: 1,
                elapsed_ms: 30000,
                pangrams_found: 1,
              },
            ],
          },
          puzzle_states: [
            {
              puzzle_number: 1,
              found_words: ['aasi', 'kana'],
              score: 2,
              hints_unlocked: ['grid'],
              started_at: 1000,
              total_paused_ms: 0,
              score_before_hints: 2,
            },
          ],
        },
      });

      expect(res.status).toBe(200);
      const pairedData = (await res.json()) as {
        token: string;
        player_id: number;
        stats: { records: Array<{ puzzle_number: number; best_score: number }> };
        puzzle_states: Array<{ puzzle_number: number; found_words: string[] }>;
      };

      expect(pairedData.player_id).toBe(originalPlayer.player_id);
      expect(pairedData.token).toBeTruthy();
      expect(pairedData.stats.records[0]?.best_score).toBe(40);
      expect(pairedData.puzzle_states[0]?.found_words).toContain('aasi');
    });

    it('rejects an invalid transfer token with 400', async () => {
      const res = await harness.client.api.player.auth.transfer.use.$post({
        json: { token: 'invalid-nonexistent-key' },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Cross-device monotonic sync endpoints', () => {
    it('merges stats monotonically (never downgrading best_score or rank)', async () => {
      const player = await createPlayer();
      const headers = { Authorization: `Bearer ${player.token}` };

      // Push initial stats
      await harness.client.api.player.sync.stats.$post(
        {
          json: {
            puzzle_number: 1,
            date: '2026-04-10',
            best_rank: 'Sanavalmis',
            best_score: 60,
            max_score: 100,
            words_found: 10,
            hints_used: 0,
            elapsed_ms: 20000,
            pangrams_found: 1,
            longest_word: 'mansikka',
          },
        },
        { headers },
      );

      // Attempt to push worse stats for the same puzzle
      await harness.client.api.player.sync.stats.$post(
        {
          json: {
            puzzle_number: 1,
            date: '2026-04-10',
            best_rank: 'Hyvä alku',
            best_score: 20,
            max_score: 100,
            words_found: 3,
            hints_used: 2,
            elapsed_ms: 40000,
            pangrams_found: 0,
            longest_word: 'apila',
          },
        },
        { headers },
      );

      // Pull synced data
      const pullRes = await harness.client.api.player.sync.$get({}, { headers });
      expect(pullRes.status).toBe(200);
      const data = (await pullRes.json()) as {
        stats: {
          records: Array<{
            best_score: number;
            best_rank: string;
            longest_word: string;
            pangrams_found: number;
          }>;
        };
      };

      const record = data.stats.records[0];
      expect(record?.best_score).toBe(60);
      expect(record?.best_rank).toBe('Sanavalmis');
      expect(record?.longest_word).toBe('mansikka');
      expect(record?.pangrams_found).toBe(1);
    });

    it('merges puzzle state union of found words', async () => {
      const player = await createPlayer();
      const headers = { Authorization: `Bearer ${player.token}` };

      await harness.client.api.player.sync.state.$post(
        {
          json: {
            puzzle_number: 1,
            found_words: ['aasi', 'kana'],
            score: 2,
            hints_unlocked: ['grid'],
            started_at: 1000,
            total_paused_ms: 0,
            score_before_hints: 2,
          },
        },
        { headers },
      );

      await harness.client.api.player.sync.state.$post(
        {
          json: {
            puzzle_number: 1,
            found_words: ['kissa', 'kana'],
            score: 5,
            hints_unlocked: ['two_letter'],
            started_at: 500,
            total_paused_ms: 100,
            score_before_hints: 2,
          },
        },
        { headers },
      );

      const pullRes = await harness.client.api.player.sync.$get({}, { headers });
      const data = (await pullRes.json()) as {
        puzzle_states: Array<{
          found_words: string[];
          hints_unlocked: string[];
          score: number;
        }>;
      };

      const state = data.puzzle_states[0];
      expect(state?.found_words.sort()).toEqual(['aasi', 'kana', 'kissa']);
      expect(state?.hints_unlocked).toContain('grid');
      expect(state?.hints_unlocked).toContain('two_letter');
      expect(state?.score).toBe(5);
    });

    it('stores and syncs player preferences with last-write-wins updated_at timestamp', async () => {
      const player = await createPlayer();
      const headers = { Authorization: `Bearer ${player.token}` };

      const prefRes = await harness.client.api.player.sync.preferences.$post(
        {
          json: {
            themeId: 'metsa',
            themePreference: 'dark',
            updated_at: '2026-04-10T12:00:00.000Z',
          },
        },
        { headers },
      );
      expect(prefRes.status).toBe(200);

      const pullRes = await harness.client.api.player.sync.$get({}, { headers });
      const data = (await pullRes.json()) as {
        preferences: { themeId: string; themePreference: string };
      };
      expect(data.preferences.themeId).toBe('metsa');
      expect(data.preferences.themePreference).toBe('dark');
    });
  });
});
