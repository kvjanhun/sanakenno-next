import {
  getHelsinkiDateString,
  PuzzleResponseSchema,
  PuzzleWordsResponseSchema,
  type PuzzleResponse,
} from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import {
  getBlockedWords,
  getFullPuzzleBySlot,
  getFullPuzzleForDate,
  getPuzzleSlotForDate,
} from './puzzle.queries.js';
import { puzzleWords, type FullPuzzleData } from './wordlist.js';

function isValidIsoCalendarDate(dateStr: string): boolean {
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
    .get('/', async (c) => {
      const dateParam = c.req.query('date');
      const todayHelsinki = getHelsinkiDateString();

      if (dateParam !== undefined) {
        if (!isValidIsoCalendarDate(dateParam)) {
          return c.json({ error: 'Invalid date parameter' }, 400);
        }
        if (dateParam > todayHelsinki) {
          return c.json({ error: 'Future puzzle dates are not allowed' }, 400);
        }
      }

      const targetDate = dateParam ?? todayHelsinki;
      const data = await getFullPuzzleForDate(db, targetDate);
      if (!data) {
        return c.json({ error: 'Puzzle not found' }, 404);
      }

      return c.json(toPuzzleResponse(data), 200);
    })
    .get('/:number', async (c) => {
      const rawNumber = c.req.param('number');
      if (!/^\d+$/.test(rawNumber)) {
        return c.json({ error: 'Invalid puzzle number' }, 400);
      }

      const slot = Number.parseInt(rawNumber, 10);
      const data = await getFullPuzzleBySlot(db, slot);
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
      const todayHelsinki = getHelsinkiDateString();
      const activeSlot = await getPuzzleSlotForDate(db, todayHelsinki);
      if (activeSlot === null) {
        return c.json({ error: 'Puzzle not found' }, 404);
      }

      if (slot === activeSlot) {
        return c.json({ error: "Word list not available for today's puzzle" }, 403);
      }

      const data = await getFullPuzzleBySlot(db, slot);
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
        const blockedWords = await getBlockedWords(db);
        const minLength =
          minLengthParam !== undefined ? Number.parseInt(minLengthParam, 10) : undefined;
        const maxLength =
          maxLengthParam !== undefined ? Number.parseInt(maxLengthParam, 10) : undefined;
        const pangramOnly = pangramOnlyParam === 'true' || pangramOnlyParam === '1';

        words = puzzleWords(data.all_letters, data.center, blockedWords, {
          minLength: Number.isFinite(minLength) ? minLength : undefined,
          maxLength: Number.isFinite(maxLength) ? maxLength : undefined,
          pangramOnly,
        });
      }

      const payload = PuzzleWordsResponseSchema.parse({
        puzzle_number: data.slot,
        display_number: data.display_number,
        center: data.center,
        letters: data.letters,
        words,
        max_score: data.max_score,
      });

      return c.json(payload, 200);
    });
}
