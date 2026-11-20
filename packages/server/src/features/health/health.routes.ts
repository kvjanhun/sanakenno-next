import { getHelsinkiDateString, HealthResponseSchema } from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { DbEngine } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { getDaysRemainingInCycle } from '../puzzle/puzzle.queries.js';
import { countActivePuzzles } from './health.queries.js';

/**
 * Mount GET /api/health canary route with end-to-end Hono RPC type inference.
 */
export function createHealthRoutes(db: Kysely<Database>, engine: DbEngine = 'kysely-sqlite') {
  return new Hono().get('/', async (c) => {
    const totalPuzzles = await countActivePuzzles(db);
    const daysRemaining = await getDaysRemainingInCycle(db, getHelsinkiDateString());
    const payload = HealthResponseSchema.parse({
      status: 'ok',
      engine,
      total_puzzles: totalPuzzles,
      days_remaining: daysRemaining,
      timezone: 'Europe/Helsinki',
    });
    return c.json(payload, 200);
  });
}
