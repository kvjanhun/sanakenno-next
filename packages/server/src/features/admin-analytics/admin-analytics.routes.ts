import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import {
  requireAdminAuth,
  securityHeaders,
  type AdminVariables,
} from '../admin-auth/admin-auth.middleware.js';
import { getFullPuzzleBySlot, getSlotByDisplayNumber } from '../puzzle/puzzle.queries.js';
import {
  getAchievementRows,
  getFailedGuessRows,
  getWordFindRows,
  groupAchievementsByDay,
  groupFailedGuessesByDay,
} from './admin-analytics.queries.js';

export function createAdminAnalyticsRoutes(db: Kysely<Database>) {
  const admin = new Hono<{ Variables: AdminVariables }>();

  admin.use('*', securityHeaders);
  admin.use('*', requireAdminAuth(db));

  return admin
    .get('/achievements', async (c) => {
      const q = c.req.query();
      const rawDays = q.days ? Number(q.days) : 7;
      const days = Math.min(90, Math.max(1, isNaN(rawDays) ? 7 : rawDays));
      const requestedMode = q.mode;
      const mode: 'users' | 'all' =
        requestedMode === 'users' || requestedMode === 'sessions' ? 'users' : 'all';

      const rows = await getAchievementRows(db, days);
      const result = groupAchievementsByDay(rows, mode, days);

      return c.json(result);
    })
    .get('/failed-guesses', async (c) => {
      const q = c.req.query();
      const rawDays = q.days ? Number(q.days) : 7;
      const days = Math.min(90, Math.max(1, isNaN(rawDays) ? 7 : rawDays));

      const rows = await getFailedGuessRows(db, days);
      const result = groupFailedGuessesByDay(rows, days);

      return c.json(result);
    })
    .get('/word-finds', async (c) => {
      const q = c.req.query();
      const rawPuzzleNumber = q.puzzle_number;
      const rawDisplayNumber = q.display_number;

      let slot: number | null = null;

      if (rawDisplayNumber) {
        const dispNum = Number(rawDisplayNumber);
        if (isNaN(dispNum) || dispNum < 1) {
          return c.json({ error: 'Virheellinen display_number' }, 400);
        }
        slot = await getSlotByDisplayNumber(db, dispNum);
        if (slot === null) {
          return c.json({ error: 'Peliä ei löydy' }, 404);
        }
      } else if (rawPuzzleNumber) {
        const pNum = Number(rawPuzzleNumber);
        if (isNaN(pNum) || pNum < 1) {
          return c.json({ error: 'Virheellinen puzzle_number' }, 400);
        }
        slot = pNum;
      } else {
        return c.json({ error: 'puzzle_number tai display_number vaaditaan' }, 400);
      }

      const puzzle = await getFullPuzzleBySlot(db, slot);
      if (!puzzle) {
        return c.json({ error: 'Peliä ei löydy' }, 404);
      }

      const findRows = await getWordFindRows(db, slot);
      const countsByWord = new Map(findRows.map((r) => [r.word, r.count]));

      const words = puzzle.words
        .map((word) => ({
          word,
          find_count: countsByWord.get(word) ?? 0,
        }))
        .sort((a, b) => {
          if (a.find_count !== b.find_count) {
            return a.find_count - b.find_count;
          }
          return a.word.localeCompare(b.word, 'fi');
        });

      const totalFinds = words.reduce((sum, item) => sum + item.find_count, 0);
      const recordedWords = words.filter((item) => item.find_count > 0).length;

      return c.json({
        puzzle_number: slot,
        display_number: puzzle.display_number,
        center: puzzle.center,
        letters: puzzle.all_letters,
        total_words: words.length,
        recorded_words: recordedWords,
        total_finds: totalFinds,
        words,
      });
    });
}
