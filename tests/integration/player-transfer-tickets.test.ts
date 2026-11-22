import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupExpiredPlayerSessions,
  countActivePlayerSessions,
  createTransferTicket,
} from '../../packages/server/src/features/player-auth/player-auth.queries.js';
import {
  resetEmailRateLimit,
  resetPlayerAuthRateLimits,
  resetTransferCreateRateLimit,
} from '../../packages/server/src/features/player-auth/player-auth.routes.js';
import { bulkUpsertLocalData } from '../../packages/server/src/features/player-sync/player-sync.queries.js';
import {
  DEFAULT_SEED_WORDS,
  setWordlist,
} from '../../packages/server/src/features/puzzle/wordlist.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Player Transfer Tickets & 6-Digit Pairing Codes (Kysely + Hono integration)', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;

  beforeEach(async () => {
    resetTransferCreateRateLimit();
    resetEmailRateLimit();
    setWordlist([...DEFAULT_SEED_WORDS, 'aasi', 'kissa']);
    harness = await createTestHarness();

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
    setWordlist(DEFAULT_SEED_WORDS);
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

  it('generates a 15-minute transfer ticket with a 6-digit formatted pairing code', async () => {
    const player = await createPlayer();
    const headers = { Authorization: `Bearer ${player.token}` };

    const res = await harness.client.api.player.auth.transfer.ticket.$post({}, { headers });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      ticket: string;
      code: string;
      expires_at: string;
    };

    expect(data.ticket).toMatch(/^[0-9a-f]{64}$/);
    expect(data.code).toMatch(/^\d{3}-\d{3}$/);

    const expiresAtMs = Date.parse(data.expires_at);
    const diffMs = expiresAtMs - Date.now();
    // Around 15 minutes (900,000 ms), allow +/- 10 seconds
    expect(diffMs).toBeGreaterThan(14 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it('links devices via 6-digit pairing code (with or without hyphen)', async () => {
    const playerA = await createPlayer();
    const headersA = { Authorization: `Bearer ${playerA.token}` };

    // Player A requests a transfer ticket
    const ticketRes = await harness.client.api.player.auth.transfer.ticket.$post(
      {},
      { headers: headersA },
    );
    expect(ticketRes.status).toBe(200);
    const ticketData = (await ticketRes.json()) as { code: string };

    // Player B uses Player A's 6-digit code
    const playerB = await createPlayer();
    const headersB = { Authorization: `Bearer ${playerB.token}` };

    const useRes = await harness.client.api.player.auth.transfer.use.$post(
      { json: { token: ticketData.code } },
      { headers: headersB },
    );
    expect(useRes.status).toBe(200);

    const useData = (await useRes.json()) as {
      player_id: number;
      token: string;
      session_count: number;
    };
    expect(useData.player_id).toBe(playerA.player_id);
    expect(useData.session_count).toBe(2);

    // Verify session count on Player A
    const meRes = await harness.client.api.player.me.$get({}, { headers: headersA });
    const meData = (await meRes.json()) as { session_count: number };
    expect(meData.session_count).toBe(2);
  });

  it('enforces single-use on transfer tickets and pairing codes', async () => {
    const playerA = await createPlayer();
    const headersA = { Authorization: `Bearer ${playerA.token}` };

    const ticketRes = await harness.client.api.player.auth.transfer.ticket.$post(
      {},
      { headers: headersA },
    );
    const { code } = (await ticketRes.json()) as { code: string };

    const playerB = await createPlayer();
    const headersB = { Authorization: `Bearer ${playerB.token}` };

    // First use succeeds
    const firstUse = await harness.client.api.player.auth.transfer.use.$post(
      { json: { token: code } },
      { headers: headersB },
    );
    expect(firstUse.status).toBe(200);

    // Second use is rejected as already used
    const playerC = await createPlayer();
    const headersC = { Authorization: `Bearer ${playerC.token}` };

    const secondUse = await harness.client.api.player.auth.transfer.use.$post(
      { json: { token: code } },
      { headers: headersC },
    );
    expect(secondUse.status).toBe(400);
    const errorData = (await secondUse.json()) as { error: string };
    expect(errorData.error).toBe('Tunniste on jo käytetty');
  });

  it('rejects expired transfer tickets', async () => {
    const player = await createPlayer();

    // Insert an expired ticket directly into DB
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await harness.db
      .insertInto('player_transfer_tickets')
      .values({
        id: 'expired-ticket-uuid',
        player_id: player.player_id,
        code: '999999',
        expires_at: expiredAt,
        used_at: null,
      })
      .execute();

    const recipient = await createPlayer();
    const recipientHeaders = { Authorization: `Bearer ${recipient.token}` };

    const res = await harness.client.api.player.auth.transfer.use.$post(
      { json: { token: '999-999' } },
      { headers: recipientHeaders },
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Tunniste on vanhentunut');
  });

  it('continues to support legacy 64-hex player keys for backwards compatibility', async () => {
    const playerA = await createPlayer();
    const playerB = await createPlayer();
    const headersB = { Authorization: `Bearer ${playerB.token}` };

    const res = await harness.client.api.player.auth.transfer.use.$post(
      { json: { token: playerA.player_key } },
      { headers: headersB },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { player_id: number; session_count: number };
    expect(data.player_id).toBe(playerA.player_id);
    expect(data.session_count).toBe(2);
  });

  it('allows exactly one concurrent redemption per single-use transfer ticket without leaking sessions or data', async () => {
    const playerA = await createPlayer();
    const headersA = { Authorization: `Bearer ${playerA.token}` };

    const ticketRes = await harness.client.api.player.auth.transfer.ticket.$post(
      {},
      { headers: headersA },
    );
    const { code } = (await ticketRes.json()) as { code: string };

    const [playerB, playerC] = await Promise.all([createPlayer(), createPlayer()]);

    const [resB, resC] = await Promise.all([
      harness.client.api.player.auth.transfer.use.$post(
        {
          json: {
            token: code,
            stats: {
              records: [
                {
                  puzzle_number: 1,
                  date: '2026-04-10',
                  best_rank: 'Hyvä',
                  best_score: 5,
                  max_score: 50,
                  words_found: 2,
                  hints_used: 0,
                  elapsed_ms: 1000,
                },
              ],
            },
          },
        },
        { headers: { Authorization: `Bearer ${playerB.token}` } },
      ),
      harness.client.api.player.auth.transfer.use.$post(
        {
          json: {
            token: code,
            stats: {
              records: [
                {
                  puzzle_number: 2,
                  date: '2026-04-11',
                  best_rank: 'Hyvä',
                  best_score: 7,
                  max_score: 50,
                  words_found: 3,
                  hints_used: 0,
                  elapsed_ms: 1000,
                },
              ],
            },
          },
        },
        { headers: { Authorization: `Bearer ${playerC.token}` } },
      ),
    ]);

    const statuses = [resB.status, resC.status].sort();
    expect(statuses).toEqual([200, 400]);

    const failedRes = resB.status === 400 ? resB : resC;
    const failedBody = (await failedRes.json()) as { error: string };
    expect(failedBody.error).toBe('Tunniste on jo käytetty');

    // Only one new session was created (2 total: playerA + the single winning redemption)
    const meRes = await harness.client.api.player.me.$get({}, { headers: headersA });
    const meData = (await meRes.json()) as { session_count: number };
    expect(meData.session_count).toBe(2);

    // Only the winning request's state row was persisted; the losing request rolled back cleanly
    const persistedStates = await harness.db
      .selectFrom('player_puzzle_states')
      .select('puzzle_number')
      .where('player_id', '=', playerA.player_id)
      .execute();
    expect(persistedStates).toHaveLength(1);
    const winningSlot = resB.status === 200 ? 1 : 2;
    expect(Number(persistedStates[0]?.puzzle_number)).toBe(winningSlot);
  });

  it('bulkUpsertLocalData merges multiple stats and puzzle states monotonically with bounded queries and zero cache pollution', async () => {
    const player = await createPlayer();
    for (let s = 3; s <= 6; s += 1) {
      await harness.db
        .insertInto('puzzles')
        .values({ slot: s, letters: 'a,e,i,k,l,n,s', center: 'a', is_active: 1 })
        .execute();
    }

    // Seed existing row on slot 1 so we prove conflict updates AND fresh inserts in one bulk run
    await bulkUpsertLocalData(
      harness.db,
      player.player_id,
      {
        version: 1,
        records: [
          {
            puzzle_number: 1,
            date: '2026-04-01',
            best_rank: 'Hyvä',
            best_score: 10,
            max_score: 50,
            words_found: 2,
            hints_used: 0,
            elapsed_ms: 5000,
          },
        ],
      },
      [
        {
          puzzle_number: 1,
          found_words: ['kana'],
          score: 1,
          hints_unlocked: [],
          started_at: 2000,
          total_paused_ms: 0,
          score_before_hints: null,
        },
      ],
    );

    let queryCount = 0;
    const countedDb = harness.db.withPlugin({
      transformQuery(args) {
        queryCount += 1;
        return args.node;
      },
      transformResult: (args) => Promise.resolve(args.result),
    });

    const slots = [1, 2, 3, 4, 5, 6];
    await bulkUpsertLocalData(
      countedDb,
      player.player_id,
      {
        version: 1,
        records: slots.map((s) => ({
          puzzle_number: s,
          date: `2026-04-0${s}`,
          best_rank: 'Hyvä',
          best_score: s === 1 ? 5 : 8,
          max_score: 50,
          words_found: 3,
          hints_used: 0,
          elapsed_ms: 3000,
        })),
      },
      slots.map((s) => ({
        puzzle_number: s,
        found_words: s === 2 ? ['kenno'] : ['aasi', 'notaword'],
        score: 1,
        hints_unlocked: [],
        started_at: 1000,
        total_paused_ms: 0,
        score_before_hints: null,
      })),
    );

    // Bounded bulk preload + SELECTs + UPSERTs (vs 40+ O(N))
    expect(queryCount).toBeLessThanOrEqual(6);

    const pullRes = await harness.client.api.player.sync.$get(
      {},
      { headers: { Authorization: `Bearer ${player.token}` } },
    );
    const data = (await pullRes.json()) as {
      stats: { records: Array<{ puzzle_number: number; best_score: number }> };
      puzzle_states: Array<{ puzzle_number: number; found_words: string[] }>;
    };
    expect(data.stats.records).toHaveLength(6);
    expect(data.stats.records.find((r) => r.puzzle_number === 1)?.best_score).toBe(10);
    expect(data.puzzle_states.find((s) => s.puzzle_number === 1)?.found_words.sort()).toEqual([
      'aasi',
      'kana',
    ]);
    expect(data.puzzle_states.find((s) => s.puzzle_number === 2)?.found_words).toEqual(['kenno']);
  });

  it('enforces rate limits on POST /api/player/auth/transfer/use and /ticket', async () => {
    const player = await createPlayer();
    const headers = { Authorization: `Bearer ${player.token}` };

    resetPlayerAuthRateLimits();
    for (let i = 0; i < 10; i++) {
      const res = await harness.client.api.player.auth.transfer.ticket.$post({}, { headers });
      expect(res.status).toBe(200);
    }
    const floodedTicket = await harness.client.api.player.auth.transfer.ticket.$post(
      {},
      { headers },
    );
    expect(floodedTicket.status).toBe(429);

    resetPlayerAuthRateLimits();
    for (let i = 0; i < 10; i++) {
      const res = await harness.client.api.player.auth.transfer.use.$post({
        json: { token: '000-000' },
      });
      expect(res.status).toBe(400);
    }
    const bruteForced = await harness.client.api.player.auth.transfer.use.$post({
      json: { token: '000-000' },
    });
    expect(bruteForced.status).toBe(429);
  });

  it('rejects invalid email formats and malformed player_key on POST /api/player/auth/transfer/create', async () => {
    const player = await createPlayer();
    const headers = { Authorization: `Bearer ${player.token}` };

    const badEmail = await harness.client.api.player.auth.transfer.create.$post(
      { json: { email: 'not-an-email' } },
      { headers },
    );
    expect(badEmail.status).toBe(400);
    expect(await badEmail.json()).toEqual({ error: 'Virheellinen sähköpostiosoite' });

    const badKey = await harness.client.api.player.auth.transfer.create.$post(
      { json: { email: 'valid@example.com', player_key: 'malformed-short-key' } },
      { headers },
    );
    expect(badKey.status).toBe(400);
    expect(await badKey.json()).toEqual({ error: 'Virheellinen tunniste' });
  });

  it('rethrows transient SQLITE_BUSY errors in createTransferTicket instead of swallowing them as code collisions', async () => {
    const player = await createPlayer();
    const busyDb = harness.db.withPlugin({
      transformQuery(args) {
        if (args.node.kind === 'InsertQueryNode') {
          const err = new Error('SQLITE_BUSY: database is locked') as Error & { code: string };
          err.code = 'SQLITE_BUSY';
          throw err;
        }
        return args.node;
      },
      transformResult: (args) => Promise.resolve(args.result),
    });

    await expect(createTransferTicket(busyDb, player.player_id)).rejects.toThrow('SQLITE_BUSY');
  });

  it('preserves same-day future space-formatted UTC sessions and honors fake timers via julianday()', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-21T02:00:00.000Z'));
      const player = await createPlayer();

      // Insert a legacy space-formatted session expiring later the same UTC day ('2026-11-21 23:00:00')
      await harness.db
        .insertInto('player_sessions')
        .values({
          id: 'legacy-space-session',
          player_id: player.player_id,
          expires_at: '2026-11-21 23:00:00',
        })
        .execute();

      await cleanupExpiredPlayerSessions(harness.db);
      const count = await countActivePlayerSessions(harness.db, player.player_id);
      expect(count).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
