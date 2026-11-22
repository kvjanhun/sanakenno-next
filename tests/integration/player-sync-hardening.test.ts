import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../packages/server/src/app.js';
import {
  resetEmailRateLimit,
  resetInitPlayerRateLimit,
  resetTransferCreateRateLimit,
} from '../../packages/server/src/features/player-auth/player-auth.routes.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Player Auth & Sync Hardening (Spec 29)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeEach(async () => {
    resetInitPlayerRateLimit();
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    setWordlist([...DEFAULT_SEED_WORDS, 'kissa']);
    harness = await createTestHarness();

    await harness.db
      .insertInto('puzzles')
      .values([{ slot: 1, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 }])
      .execute();
  });

  afterEach(async () => {
    resetInitPlayerRateLimit();
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    setWordlist(DEFAULT_SEED_WORDS);
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
    expect(data.puzzle_states[0]?.score_before_hints).toBeNull();
    expect(data.stats.records[0]?.words_found).toBe(2);
    expect(data.stats.records[0]?.best_score).toBe(6);
    expect(data.stats.records[0]?.best_no_hint_score).toBe(6);
  });

  it('preserves updated score_before_hints after an initial hintless offline sync', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string };
    const headers = { Authorization: `Bearer ${player.token}` };

    // Simulate an older client pushing 1 pt without hints but with a polluted score_before_hints: 1
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: ['kana'],
          score: 1,
          max_score: 100,
          hints_unlocked: [],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 1,
          best_no_hint_score: 1,
        },
      },
      { headers },
    );

    // Later, player earns more points without hints (kana + kissa = 6), unlocks a hint, then finds kansallinen (total 24)
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: ['kana', 'kissa', 'kansallinen'],
          score: 24,
          max_score: 100,
          hints_unlocked: ['grid'],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 6,
          best_no_hint_score: 6,
        },
      },
      { headers },
    );

    const pullRes = await harness.client.api.player.sync.$get({}, { headers });
    const data = (await pullRes.json()) as {
      puzzle_states: Array<{
        score: number;
        score_before_hints: number | null;
      }>;
      stats: {
        records: Array<{
          best_score: number;
          best_no_hint_score: number;
        }>;
      };
    };

    expect(data.puzzle_states[0]?.score).toBe(24);
    expect(data.puzzle_states[0]?.score_before_hints).toBe(6);
    expect(data.stats.records[0]?.best_score).toBe(24);
    expect(data.stats.records[0]?.best_no_hint_score).toBe(6);
  });

  it('caps tampered stats records against puzzle max_score and word count on POST /api/player/auth/transfer/use', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { player_key: string; token: string };

    const useRes = await harness.client.api.player.auth.transfer.use.$post({
      json: {
        token: player.player_key,
        stats: {
          records: [
            {
              puzzle_number: 1,
              date: '2026-04-10',
              best_rank: 'Täysi kenno',
              best_score: 99999,
              max_score: 99999,
              words_found: 9999,
              hints_used: 0,
              elapsed_ms: 5000,
              pangrams_found: 999,
              best_no_hint_score: 99999,
            },
          ],
        },
      },
    });
    expect(useRes.status).toBe(200);
    const body = (await useRes.json()) as {
      stats: {
        records: Array<{
          best_score: number;
          max_score: number;
          words_found: number;
          pangrams_found: number;
          best_no_hint_score: number;
          best_rank: string;
        }>;
      };
    };

    const rec = body.stats.records[0]!;
    expect(rec.max_score).toBeLessThan(99999);
    expect(rec.best_score).toBe(rec.max_score);
    expect(rec.best_no_hint_score).toBe(rec.max_score);
    expect(rec.words_found).toBeLessThan(9999);
    expect(rec.pangrams_found).toBeLessThan(999);
    expect(rec.best_rank).toBe('Täysi kenno');
  });

  it('returns 404 for removed legacy sync/stats, sync/state, and auth/transfer/email routes', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string };
    const headers = {
      Authorization: `Bearer ${player.token}`,
      'Content-Type': 'application/json',
    };

    for (const path of [
      '/api/player/sync/stats',
      '/api/player/sync/state',
      '/api/player/auth/transfer/email',
    ]) {
      const res = await harness.app.request(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(404);
    }
  });

  it('resolves puzzle once outside the write transaction on POST /api/player/sync/progress', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string };

    const executedTables: string[] = [];
    const countedDb = harness.db.withPlugin({
      transformQuery(args) {
        const json = JSON.stringify(args.node);
        if (json.includes('"puzzles"')) executedTables.push('puzzles');
        if (json.includes('"blocked_words"')) executedTables.push('blocked_words');
        return args.node;
      },
      transformResult: (args) => Promise.resolve(args.result),
    });
    const countedApp = createApp(countedDb);

    // Warm puzzle cache on the same db instance first (simulating normal play)
    await countedApp.request('/api/puzzle');
    executedTables.length = 0;

    const res = await countedApp.request('/api/player/sync/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${player.token}`,
      },
      body: JSON.stringify({
        puzzle_number: 1,
        date: '2026-04-10',
        found_words: ['kana'],
        score: 1,
        max_score: 50,
        hints_unlocked: [],
        started_at: 1000,
        total_paused_ms: 0,
        score_before_hints: null,
        best_no_hint_score: 1,
      }),
    });
    expect(res.status).toBe(200);
    // Warm cache: 2 parallel queries inside getFullPuzzleBySlot (row + activeSlots), 0 blocked_words scans, and never repeated 3x inside tx
    expect(executedTables.filter((t) => t === 'puzzles')).toHaveLength(2);
    expect(executedTables.filter((t) => t === 'blocked_words')).toHaveLength(0);
  });

  it('persists 0-word hint-only syncs to player_puzzle_states without creating a 0-word player_stats row, and updates existing stats when present', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as { token: string };
    const headers = { Authorization: `Bearer ${player.token}` };

    // 1. Unlock a hint with 0 words found -> saves puzzle_state, creates NO stats record
    const zeroWordHintRes = await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: [],
          score: 0,
          max_score: 100,
          hints_unlocked: ['tier1'],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 0,
          best_no_hint_score: 0,
          is_daily: true,
          played_at_date: '2026-04-10',
        },
      },
      { headers },
    );
    expect(zeroWordHintRes.status).toBe(200);

    const pull1 = await harness.client.api.player.sync.$get({}, { headers });
    const data1 = (await pull1.json()) as {
      puzzle_states: Array<{ hints_unlocked: string[]; score_before_hints: number | null }>;
      stats: { records: Array<{ puzzle_number: number; hints_used: number }> };
    };
    expect(data1.puzzle_states).toHaveLength(1);
    expect(data1.puzzle_states[0]?.hints_unlocked).toEqual(['tier1']);
    expect(data1.puzzle_states[0]?.score_before_hints).toBe(0);
    expect(data1.stats.records).toHaveLength(0);

    // 1b. A 0-word daily hint unlock must NOT persist is_daily=1 (archive play later stays is_daily=false)
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: ['kana'],
          score: 1,
          max_score: 100,
          hints_unlocked: ['tier1'],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 0,
          is_daily: false,
          played_at_date: '2026-04-12',
        },
      },
      { headers },
    );
    const pullArchive = await harness.client.api.player.sync.$get({}, { headers });
    const dataArchive = (await pullArchive.json()) as {
      stats: { records: Array<{ is_daily?: boolean }> };
    };
    expect(dataArchive.stats.records[0]?.is_daily).toBe(false);

    // 2. Now find a word on daily -> is_daily upgrades monotonically; subsequent hint-only sync updates hints_used
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: ['kana'],
          score: 1,
          max_score: 100,
          hints_unlocked: ['tier1'],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 0,
          best_no_hint_score: 0,
          is_daily: true,
          played_at_date: '2026-04-10',
        },
      },
      { headers },
    );
    await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: [],
          score: 0,
          max_score: 100,
          hints_unlocked: ['tier1', 'tier2'],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 0,
          best_no_hint_score: 0,
        },
      },
      { headers },
    );

    const pull2 = await harness.client.api.player.sync.$get({}, { headers });
    const data2 = (await pull2.json()) as {
      stats: { records: Array<{ words_found: number; hints_used: number; is_daily?: boolean }> };
    };
    expect(data2.stats.records).toHaveLength(1);
    expect(data2.stats.records[0]?.words_found).toBe(1);
    expect(data2.stats.records[0]?.hints_used).toBe(2);
    expect(data2.stats.records[0]?.is_daily).toBe(true);
  });

  it('degrades corrupt JSON in player_puzzle_states safely to [] across sync pull, progress push, and transfer use', async () => {
    const initRes = await harness.client.api.player.auth.init.$post();
    const player = (await initRes.json()) as {
      token: string;
      player_id: number;
      player_key: string;
    };
    const headers = { Authorization: `Bearer ${player.token}` };

    await harness.db
      .insertInto('player_puzzle_states')
      .values({
        player_id: player.player_id,
        puzzle_number: 1,
        found_words: '{corrupt-json',
        score: 5,
        hints_unlocked: 'not-an-array',
        started_at: 1000,
        total_paused_ms: 0,
        score_before_hints: null,
      })
      .execute();

    const pullRes = await harness.client.api.player.sync.$get({}, { headers });
    expect(pullRes.status).toBe(200);
    const pulled = (await pullRes.json()) as {
      puzzle_states: Array<{ found_words: string[]; hints_unlocked: string[] }>;
    };
    expect(pulled.puzzle_states[0]?.found_words).toEqual([]);
    expect(pulled.puzzle_states[0]?.hints_unlocked).toEqual([]);

    const pushRes = await harness.client.api.player.sync.progress.$post(
      {
        json: {
          puzzle_number: 1,
          date: '2026-04-10',
          found_words: ['kana'],
          score: 1,
          max_score: 100,
          hints_unlocked: ['tier1'],
          started_at: 1000,
          total_paused_ms: 0,
          score_before_hints: 1,
        },
      },
      { headers },
    );
    expect(pushRes.status).toBe(200);

    // Re-corrupt before testing /auth/transfer/use bulk upsert
    await harness.db
      .updateTable('player_puzzle_states')
      .set({ found_words: 'invalid', hints_unlocked: '{"bad":true}' })
      .where('player_id', '=', player.player_id)
      .execute();

    const transferRes = await harness.client.api.player.auth.transfer.use.$post({
      json: {
        token: player.player_key,
        puzzle_states: [
          {
            puzzle_number: 1,
            found_words: ['kissa'],
            score: 5,
            hints_unlocked: ['tier2'],
            started_at: 900,
            total_paused_ms: 0,
            score_before_hints: 0,
          },
        ],
      },
    });
    expect(transferRes.status).toBe(200);
    const transferred = (await transferRes.json()) as {
      puzzle_states: Array<{ found_words: string[]; hints_unlocked: string[] }>;
    };
    expect(transferred.puzzle_states[0]?.found_words).toEqual(['kissa']);
    expect(transferred.puzzle_states[0]?.hints_unlocked).toEqual(['tier2']);
  });
});
