import { ArchiveResponseSchema, getHelsinkiDateString, type ArchiveEntry } from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getActiveSlots, getFullPuzzleForDate, getPuzzleSlotForDate } from './puzzle.queries.js';

function addDaysToIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + deltaDays));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

    const entries: ArchiveEntry[] = [];
    for (let daysAgo = 0; daysAgo < days; daysAgo++) {
      const dateStr = addDaysToIsoDate(todayHelsinki, -daysAgo);
      const puzzle = await getFullPuzzleForDate(db, dateStr);
      if (!puzzle) continue;

      entries.push({
        date: dateStr,
        puzzle_number: puzzle.slot,
        display_number: puzzle.display_number,
        letters: [puzzle.center, ...puzzle.letters],
        center: puzzle.center,
        is_today: daysAgo === 0,
        max_score: puzzle.max_score,
      });
    }

    return c.json(ArchiveResponseSchema.parse(entries), 200);
  });
}
