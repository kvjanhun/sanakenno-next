import {
  getHelsinkiDateString,
  isPangram,
  PuzzleDateQuerySchema,
  PuzzleResponseSchema,
  PuzzleWordsResponseSchema,
  type PuzzleResponse,
} from '@sanakenno/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { zodErrorHook } from '../../lib/zod-validator.js';
import {
  computePuzzleSlotForDate,
  getActiveSlots,
  getEpochDate,
  getFullPuzzleBySlot,
  getSlotScheduleInfo,
} from './puzzle.queries.js';
import { getCanonicalLemma, MIN_WORD_LENGTH, type FullPuzzleData } from './wordlist.js';

export function isValidIsoCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toPuzzleResponse(data: FullPuzzleData): PuzzleResponse {
  return PuzzleResponseSchema.parse({
    center: data.center,
    letters: data.letters,
    word_hashes: data.word_hashes,
    hint_data: data.hint_data,
    max_score: data.max_score,
    puzzle_number: data.slot,
    display_number: data.display_number,
    total_puzzles: data.total_puzzles,
  });
}

/**
 * Mount chained GET /api/puzzle, GET /api/puzzle/:number, and GET /api/puzzle/:number/words routes.
 */
export function createPuzzleRoutes(db: Kysely<Database>) {
  return new Hono()
    .get(
      '/',
      zValidator('query', PuzzleDateQuerySchema, zodErrorHook('Invalid date parameter')),
      async (c) => {
        const dateParam = c.req.valid('query')?.date;
        const todayHelsinki = getHelsinkiDateString();

        if (dateParam !== undefined) {
          if (!isValidIsoCalendarDate(dateParam)) {
            return c.json({ error: 'Invalid date parameter' }, 400);
          }
          if (dateParam > todayHelsinki) {
            return c.json({ error: 'Future puzzle dates are not allowed' }, 400);
          }
        }

        const [activeSlots, epochDateStr] = await Promise.all([
          getActiveSlots(db),
          getEpochDate(db),
        ]);
        if (dateParam !== undefined && dateParam < epochDateStr) {
          return c.json({ error: 'Invalid date parameter' }, 400);
        }

        const targetDate = dateParam ?? todayHelsinki;
        const slot = computePuzzleSlotForDate(activeSlots, epochDateStr, targetDate);
        if (slot === null) {
          return c.json({ error: 'Puzzle not found' }, 404);
        }

        const data = await getFullPuzzleBySlot(db, slot, activeSlots);
        if (!data) {
          return c.json({ error: 'Puzzle not found' }, 404);
        }

        return c.json(toPuzzleResponse(data), 200);
      },
    )
    .get('/:number', async (c) => {
      const rawNumber = c.req.param('number');
      if (!/^\d+$/.test(rawNumber)) {
        return c.json({ error: 'Invalid puzzle number' }, 400);
      }

      const slot = Number.parseInt(rawNumber, 10);
      const { relation, activeSlots } = await getSlotScheduleInfo(
        db,
        slot,
        getHelsinkiDateString(),
      );
      if (relation === 'inactive') {
        return c.json({ error: 'Puzzle not found' }, 404);
      }
      if (relation === 'future') {
        return c.json({ error: 'Future puzzles are not available' }, 403);
      }

      const data = await getFullPuzzleBySlot(db, slot, activeSlots);
      if (!data) {
        return c.json({ error: 'Puzzle not found' }, 404);
      }

      return c.json(toPuzzleResponse(data), 200);
    })
    .get('/:number/words', async (c) => {
      const rawNumber = c.req.param('number');
      if (!/^\d+$/.test(rawNumber)) {
        return c.json({ error: 'Invalid puzzle number' }, 400);
      }

      const slot = Number.parseInt(rawNumber, 10);
      const { relation, activeSlots } = await getSlotScheduleInfo(
        db,
        slot,
        getHelsinkiDateString(),
      );
      if (relation === 'inactive') {
        return c.json({ error: 'Puzzle not found' }, 404);
      }
      if (relation === 'today' || relation === 'future') {
        return c.json({ error: "Word list not available for today's or future puzzles" }, 403);
      }

      const data = await getFullPuzzleBySlot(db, slot, activeSlots);
      if (!data) {
        return c.json({ error: 'Puzzle not found' }, 404);
      }

      const minLengthParam = c.req.query('minLength');
      const maxLengthParam = c.req.query('maxLength');
      const pangramOnlyParam = c.req.query('pangramOnly');
      const hasFilters =
        minLengthParam !== undefined ||
        maxLengthParam !== undefined ||
        pangramOnlyParam !== undefined;

      let words = data.words;
      if (hasFilters) {
        const parsedMin =
          minLengthParam !== undefined ? Number.parseInt(minLengthParam, 10) : MIN_WORD_LENGTH;
        const minLength = Number.isFinite(parsedMin)
          ? Math.max(MIN_WORD_LENGTH, parsedMin)
          : MIN_WORD_LENGTH;
        const parsedMax =
          maxLengthParam !== undefined ? Number.parseInt(maxLengthParam, 10) : Infinity;
        const maxLength = Number.isFinite(parsedMax) ? parsedMax : Infinity;
        const pangramOnly = pangramOnlyParam === 'true' || pangramOnlyParam === '1';
        const allLetterSet = new Set([data.center, ...data.letters]);

        words = data.words.filter((word) => {
          if (word.length < minLength || word.length > maxLength) return false;
          if (pangramOnly && !isPangram(word, allLetterSet)) return false;
          return true;
        });
      }

      const payload = PuzzleWordsResponseSchema.parse({
        puzzle_number: data.slot,
        display_number: data.display_number,
        center: data.center,
        letters: data.letters,
        words: words.map((w) => getCanonicalLemma(w)),
        max_score: data.max_score,
      });

      return c.json(payload, 200);
    });
}
