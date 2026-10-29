import { ArchiveResponseSchema, getHelsinkiDateString } from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getActiveSlots, getArchiveMetadata, getPuzzleSlotForDate } from './puzzle.queries.js';

/**
 * Mount chained GET /api/archive route for last-7-days or full active-cycle (`?all=true`) history.
 */
export function createArchiveRoutes(db: Kysely<Database>) {
  return new Hono().get('/', async (c) => {
    const allParam = c.req.query('all');
    const todayHelsinki = getHelsinkiDateString();
    const activeSlots = await getActiveSlots(db);

    if (activeSlots.length === 0) {
      return c.json(ArchiveResponseSchema.parse([]), 200);
    }

    let days = 7;
    if (allParam === 'true') {
      const todaySlot = await getPuzzleSlotForDate(db, todayHelsinki);
      const currentIndex = todaySlot !== null ? activeSlots.indexOf(todaySlot) : -1;
      days = currentIndex > 0 ? currentIndex + 1 : activeSlots.length;
    }

    const entries = await getArchiveMetadata(db, todayHelsinki, days);
    return c.json(ArchiveResponseSchema.parse(entries), 200);
  });
}
