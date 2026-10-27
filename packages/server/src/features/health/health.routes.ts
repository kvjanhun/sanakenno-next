import { Hono } from 'hono';
import { HealthResponseSchema } from '@sanakenno/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { countActivePuzzles } from './health.queries.js';

/**
 * Mount GET /api/health canary route with end-to-end Hono RPC type inference.
 */
export function createHealthRoutes(db: Kysely<Database>) {
  return new Hono().get('/', async (c) => {
    const totalPuzzles = await countActivePuzzles(db);
    const payload = HealthResponseSchema.parse({
      status: 'ok',
      engine: 'kysely-sqlite',
      total_puzzles: totalPuzzles,
      timezone: 'Europe/Helsinki',
    });
    return c.json(payload, 200);
  });
}
