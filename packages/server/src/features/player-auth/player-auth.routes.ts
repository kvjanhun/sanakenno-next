import { zValidator } from '@hono/zod-validator';
import {
  TransferCreatePayloadSchema,
  TransferUsePayloadSchema,
  type TransferCreatePayload,
} from '@sanakenno/shared';
import { Hono, type Context } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { zodErrorHook } from '../../lib/zod-validator.js';
import {
  bulkUpsertLocalData,
  fetchPlayerData,
  preloadBulkPuzzleMeta,
} from '../player-sync/player-sync.queries.js';
import {
  checkEmailRateLimit,
  initPlayerRateLimit,
  requirePlayerAuth,
  resetEmailRateLimit,
  resetInitPlayerRateLimit,
  resetPlayerAuthRateLimits,
  resetTransferCreateRateLimit,
  resetTransferTicketRateLimit,
  resetTransferUseRateLimit,
  setEmailRateLimitEntry,
  transferCreateRateLimit,
  transferTicketRateLimit,
  transferUseRateLimit,
  type PlayerVariables,
} from './player-auth.middleware.js';
import {
  cleanupExpiredPlayerSessions,
  countActivePlayerSessions,
  createPlayerIdentity,
  createPlayerSession,
  createTransferTicket,
  deletePlayerSession,
  getPlayerById,
  getPlayerByKeyHash,
  getTransferTicket,
  hashPlayerKey,
  markTransferTicketUsed,
  rotatePlayerKeyAndInvalidateOtherSessions,
} from './player-auth.queries.js';
import { sendTransferLink } from './send-transfer-link.js';

export {
  resetEmailRateLimit,
  resetInitPlayerRateLimit,
  resetPlayerAuthRateLimits,
  resetTransferCreateRateLimit,
  resetTransferTicketRateLimit,
  resetTransferUseRateLimit,
  setEmailRateLimitEntry,
};

const PLAYER_KEY_HEX_RE = /^[0-9a-f]{64}$/i;

class TransferTicketClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferTicketClaimError';
  }
}

const transferEmailErrorHook = zodErrorHook<{ Variables: PlayerVariables }>((err) => {
  const issue = err.issues[0];
  const field = issue?.path[0];
  if (field === 'player_key') return { error: 'Tunniste puuttuu' };
  if (field === 'email') {
    return {
      error:
        issue?.code === 'invalid_string'
          ? 'Virheellinen sähköpostiosoite'
          : 'Sähköpostiosoite puuttuu',
    };
  }
  return { error: 'Virheellinen pyyntö' };
});

async function handleTransferEmail(
  db: Kysely<Database>,
  c: Context<{ Variables: PlayerVariables }>,
  body: TransferCreatePayload,
) {
  const player = c.get('player');
  const email = body.email.trim();
  const playerKey = typeof body.player_key === 'string' ? body.player_key.trim() : '';

  if (playerKey) {
    if (!PLAYER_KEY_HEX_RE.test(playerKey)) {
      return c.json({ error: 'Virheellinen tunniste' }, 400);
    }
    const row = await getPlayerById(db, player.playerId);
    if (!row || row.player_key_hash !== hashPlayerKey(playerKey)) {
      return c.json({ error: 'Virheellinen tunniste' }, 400);
    }
  }

  const { allowed, error } = checkEmailRateLimit(email);
  if (!allowed) {
    return c.json({ error: error ?? 'Liian monta yritystä' }, 429);
  }

  const ticket = await runImmediateTransactionWithRetry(db, (trx) =>
    createTransferTicket(trx, player.playerId),
  );

  const baseUrl = process.env.BASE_URL || 'https://sanakenno.fi';
  await sendTransferLink(email, ticket.ticket, baseUrl).catch((err: unknown) => {
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
    .post('/auth/init', initPlayerRateLimit, async (c) => {
      const { playerId, playerKey, token } = await runImmediateTransactionWithRetry(db, (trx) =>
        createPlayerIdentity(trx),
      );
      return c.json({ player_key: playerKey, token, player_id: playerId }, 200);
    })
    .post('/auth/transfer/ticket', authMiddleware, transferTicketRateLimit, async (c) => {
      const player = c.get('player');
      const ticket = await runImmediateTransactionWithRetry(db, (trx) =>
        createTransferTicket(trx, player.playerId),
      );
      return c.json(
        {
          ticket: ticket.ticket,
          code: ticket.code,
          expires_at: ticket.expiresAt,
        },
        200,
      );
    })
    .post(
      '/auth/transfer/create',
      authMiddleware,
      transferCreateRateLimit,
      zValidator('json', TransferCreatePayloadSchema, transferEmailErrorHook),
      (c) => handleTransferEmail(db, c, c.req.valid('json')),
    )
    .post(
      '/auth/transfer/use',
      transferUseRateLimit,
      zValidator(
        'json',
        TransferUsePayloadSchema,
        zodErrorHook((err) => ({
          error: err.issues[0]?.path[0] === 'token' ? 'Tunniste puuttuu' : 'Virheellinen pyyntö',
        })),
      ),
      async (c) => {
        const { token: rawToken, stats, puzzle_states: puzzleStates } = c.req.valid('json');

        const ticket = await getTransferTicket(db, rawToken);
        let playerId: number;

        if (ticket) {
          if (ticket.used_at !== null) {
            return c.json({ error: 'Tunniste on jo käytetty' }, 400);
          }
          if (Date.parse(ticket.expires_at) <= Date.now()) {
            return c.json({ error: 'Tunniste on vanhentunut' }, 400);
          }
          playerId = ticket.player_id;
        } else {
          const row = await getPlayerByKeyHash(db, hashPlayerKey(rawToken));
          if (!row) {
            return c.json({ error: 'Virheellinen tunniste' }, 400);
          }
          playerId = row.id;
        }

        const authHeader = c.req.header('Authorization');
        let existingSessionToken: string | null = null;
        if (authHeader?.startsWith('Bearer ')) {
          existingSessionToken = authHeader.slice(7).trim();
        }

        const preloadedPuzzles = await preloadBulkPuzzleMeta(db, stats, puzzleStates);

        let token: string;
        let sessionCount: number;
        try {
          const result = await runImmediateTransactionWithRetry(db, async (trx) => {
            if (ticket) {
              const nowMs = Date.now();
              if (Date.parse(ticket.expires_at) <= nowMs) {
                throw new TransferTicketClaimError('Tunniste on vanhentunut');
              }
              const claimed = await markTransferTicketUsed(
                trx,
                ticket.id,
                new Date(nowMs).toISOString(),
              );
              if (!claimed) {
                throw new TransferTicketClaimError('Tunniste on jo käytetty');
              }
            }
            await bulkUpsertLocalData(trx, playerId, stats, puzzleStates, preloadedPuzzles);
            await cleanupExpiredPlayerSessions(trx);
            if (existingSessionToken) {
              await deletePlayerSession(trx, existingSessionToken);
            }
            const newToken = await createPlayerSession(trx, playerId);
            const count = await countActivePlayerSessions(trx, playerId);
            return { token: newToken, sessionCount: count };
          });
          token = result.token;
          sessionCount = result.sessionCount;
        } catch (err) {
          if (err instanceof TransferTicketClaimError) {
            return c.json({ error: err.message }, 400);
          }
          throw err;
        }

        const playerData = await fetchPlayerData(db, playerId);
        return c.json(
          {
            token,
            player_id: playerId,
            session_count: sessionCount,
            ...playerData,
          },
          200,
        );
      },
    )
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
    .get('/me', authMiddleware, async (c) => {
      const player = c.get('player');
      const sessionCount = await countActivePlayerSessions(db, player.playerId);
      return c.json({ player_id: player.playerId, session_count: sessionCount }, 200);
    });
}
