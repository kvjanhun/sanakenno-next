import { zValidator } from '@hono/zod-validator';
import { SyncPreferencesPayloadSchema, SyncProgressPayloadSchema } from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { zodErrorHook } from '../../lib/zod-validator.js';
import { requirePlayerAuth, type PlayerVariables } from '../player-auth/player-auth.middleware.js';
import {
  deriveStatsFromProgress,
  fetchPlayerData,
  mergeAndStorePuzzleState,
  mergeAndStoreStatsRecord,
  upsertPlayerPreferences,
} from './player-sync.queries.js';

/**
 * Mount chained `/api/player/sync` routes for pulling and pushing player progress.
 */
export function createPlayerSyncRoutes(db: Kysely<Database>) {
  const authMiddleware = requirePlayerAuth(db);

  return new Hono<{ Variables: PlayerVariables }>()
    .get('/', authMiddleware, async (c) => {
      const player = c.get('player');
      const data = await fetchPlayerData(db, player.playerId);
      return c.json(data, 200);
    })
    .post(
      '/progress',
      authMiddleware,
      zValidator('json', SyncProgressPayloadSchema, zodErrorHook('Virheellinen pyyntö')),
      async (c) => {
        const player = c.get('player');
        const payload = c.req.valid('json');

        await runImmediateTransactionWithRetry(db, async (trx) => {
          const mergedState = await mergeAndStorePuzzleState(trx, player.playerId, payload);
          const derivedStats = await deriveStatsFromProgress(trx, payload, mergedState);
          await mergeAndStoreStatsRecord(trx, player.playerId, derivedStats);
        });

        return c.json({ status: 'synced' as const }, 200);
      },
    )
    .post(
      '/preferences',
      authMiddleware,
      zValidator('json', SyncPreferencesPayloadSchema, zodErrorHook('Virheellinen pyyntö')),
      async (c) => {
        const player = c.get('player');
        const incoming = c.req.valid('json');

        const result = await runImmediateTransactionWithRetry(db, (trx) =>
          upsertPlayerPreferences(trx, player.playerId, incoming),
        );

        return c.json(result, 200);
      },
    );
}
