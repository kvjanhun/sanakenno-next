import type { PlayerStats, SyncPuzzleState } from '@sanakenno/shared';
import { Hono, type Context } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { bulkUpsertLocalData, fetchPlayerData } from '../player-sync/player-sync.queries.js';
import {
  checkEmailRateLimit,
  requirePlayerAuth,
  resetEmailRateLimit,
  resetTransferCreateRateLimit,
  setEmailRateLimitEntry,
  transferCreateRateLimit,
  type PlayerVariables,
} from './player-auth.middleware.js';
import {
  cleanupExpiredPlayerSessions,
  createPlayerIdentity,
  createPlayerSession,
  deletePlayerSession,
  getPlayerById,
  getPlayerByKeyHash,
  hashPlayerKey,
  rotatePlayerKeyAndInvalidateOtherSessions,
} from './player-auth.queries.js';
import { sendTransferLink } from './send-transfer-link.js';

export { resetEmailRateLimit, resetTransferCreateRateLimit, setEmailRateLimitEntry };

async function handleTransferEmail(
  db: Kysely<Database>,
  c: Context<{ Variables: PlayerVariables }>,
) {
  const player = c.get('player');
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    // Ignore malformed JSON and validate fields below.
  }

  const email = typeof body['email'] === 'string' ? body['email'].trim() : '';
  const playerKey = typeof body['player_key'] === 'string' ? body['player_key'].trim() : '';

  if (!playerKey) {
    return c.json({ error: 'Tunniste puuttuu' }, 400);
  }

  const row = await getPlayerById(db, player.playerId);
  if (!row || row.player_key_hash !== hashPlayerKey(playerKey)) {
    return c.json({ error: 'Virheellinen tunniste' }, 400);
  }

  if (!email) {
    return c.json({ error: 'Sähköpostiosoite puuttuu' }, 400);
  }

  const { allowed, error } = checkEmailRateLimit(email);
  if (!allowed) {
    return c.json({ error: error ?? 'Liian monta yritystä' }, 429);
  }

  const baseUrl = process.env.BASE_URL || 'https://sanakenno.fi';
  await sendTransferLink(email, playerKey, baseUrl).catch((err: unknown) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'Transfer link email failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });

  return c.json({ status: 'ok' }, 200);
}

/**
 * Mount chained player authentication routes under `/api/player`.
 */
export function createPlayerAuthRoutes(db: Kysely<Database>) {
  const authMiddleware = requirePlayerAuth(db);

  return new Hono<{ Variables: PlayerVariables }>()
    .post('/auth/init', async (c) => {
      const { playerId, playerKey, token } = await runImmediateTransactionWithRetry(db, (trx) =>
        createPlayerIdentity(trx),
      );
      return c.json({ player_key: playerKey, token, player_id: playerId }, 200);
    })
    .post('/auth/transfer/create', authMiddleware, transferCreateRateLimit, (c) =>
      handleTransferEmail(db, c),
    )
    .post('/auth/transfer/email', authMiddleware, transferCreateRateLimit, (c) =>
      handleTransferEmail(db, c),
    )
    .post('/auth/transfer/use', async (c) => {
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // Ignore malformed JSON and validate token below.
      }

      const rawToken = typeof body['token'] === 'string' ? body['token'].trim() : '';
      if (!rawToken) {
        return c.json({ error: 'Tunniste puuttuu' }, 400);
      }

      const row = await getPlayerByKeyHash(db, hashPlayerKey(rawToken));
      if (!row) {
        return c.json({ error: 'Virheellinen tunniste' }, 400);
      }

      const playerId = row.id;
      const stats = body['stats'] as PlayerStats | undefined;
      const puzzleStates = body['puzzle_states'] as SyncPuzzleState[] | undefined;

      const token = await runImmediateTransactionWithRetry(db, async (trx) => {
        await bulkUpsertLocalData(trx, playerId, stats, puzzleStates);
        await cleanupExpiredPlayerSessions(trx);
        return createPlayerSession(trx, playerId);
      });

      const playerData = await fetchPlayerData(db, playerId);
      return c.json(
        {
          token,
          player_id: playerId,
          ...playerData,
        },
        200,
      );
    })
    .post('/auth/rotate', authMiddleware, async (c) => {
      const player = c.get('player');
      const currentToken = c.get('playerToken');
      const newKey = await runImmediateTransactionWithRetry(db, (trx) =>
        rotatePlayerKeyAndInvalidateOtherSessions(trx, player.playerId, currentToken),
      );
      return c.json({ player_key: newKey }, 200);
    })
    .post('/auth/logout', authMiddleware, async (c) => {
      const currentToken = c.get('playerToken');
      await deletePlayerSession(db, currentToken);
      return c.json({ status: 'ok' }, 200);
    })
    .get('/me', authMiddleware, (c) => {
      const player = c.get('player');
      return c.json({ player_id: player.playerId }, 200);
    });
}
