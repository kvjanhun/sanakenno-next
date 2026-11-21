import {
  ArchiveQuerySchema,
  ArchiveResponseSchema,
  getHelsinkiDateString,
} from '@sanakenno/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getArchiveMetadata } from './puzzle.queries.js';

/**
 * Mount chained GET /api/archive route for last-7-days or full active-cycle (`?all=true`) history.
 */
export function createArchiveRoutes(db: Kysely<Database>) {
  return new Hono().get('/', zValidator('query', ArchiveQuerySchema), async (c) => {
    const allParam = c.req.valid('query')?.all;
    const todayHelsinki = getHelsinkiDateString();
    const requestedDays = allParam === 'true' ? 'all' : 7;

    const entries = await getArchiveMetadata(db, todayHelsinki, requestedDays);
    return c.json(ArchiveResponseSchema.parse(entries), 200);
  });
}
