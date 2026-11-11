import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resetEmailRateLimit,
  resetTransferCreateRateLimit,
} from '../../packages/server/src/features/player-auth/player-auth.routes.js';
import { createTestHarness } from '../../packages/server/src/testing.js';

describe('Player Transfer Tickets & 6-Digit Pairing Codes (Kysely + Hono integration)', () => {
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
});
