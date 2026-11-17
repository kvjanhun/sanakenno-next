import { zValidator } from '@hono/zod-validator';
import {
  AchievementPayloadSchema,
  FailedGuessPayloadSchema,
  getHelsinkiDateString,
  WordFindPayloadSchema,
} from '@sanakenno/shared';
import { Hono, type Context, type Next } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { zodErrorHook } from '../../lib/zod-validator.js';
import {
  getClientIp,
  getRateLimitKey,
  SlidingWindowRateLimiter,
} from '../player-auth/rate-limiter.js';
import { validatePlayerToken } from '../player-auth/player-auth.queries.js';
import { getFullPuzzleBySlot, getFullPuzzleForDate } from '../puzzle/puzzle.queries.js';
import {
  insertAchievement,
  isActivePuzzleSlot,
  upsertFailedGuess,
  upsertWordFind,
} from './telemetry.queries.js';

const MAX_WORD_LENGTH = 20;

const ACHIEVEMENT_RATE_LIMIT = 10;
const FAILED_GUESS_RATE_LIMIT = 30;
const WORD_FIND_RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export const achievementLimiter = new SlidingWindowRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: ACHIEVEMENT_RATE_LIMIT,
});
export const failedGuessLimiter = new SlidingWindowRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: FAILED_GUESS_RATE_LIMIT,
});
export const wordFindLimiter = new SlidingWindowRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxRequests: WORD_FIND_RATE_LIMIT,
});

export function resetTelemetryRateLimits(): void {
  achievementLimiter.reset();
  failedGuessLimiter.reset();
  wordFindLimiter.reset();
}

async function getVerifiedTelemetryRateLimitKey(db: Kysely<Database>, c: Context): Promise<string> {
  const auth = c.req.header('Authorization') || c.req.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) {
      const session = await validatePlayerToken(db, token);
      if (session) {
        return getRateLimitKey(c);
      }
    }
  }
  return `ip:${getClientIp(c)}`;
}

function createRateLimiterMiddleware(
  db: Kysely<Database>,
  limiter: SlidingWindowRateLimiter,
  errorMessage: string,
) {
  return async (c: Context, next: Next) => {
    const key = await getVerifiedTelemetryRateLimitKey(db, c);
    if (!limiter.isAllowed(key)) {
      return c.json({ error: errorMessage }, 429);
    }
    return next();
  };
}

/**
 * Mount `POST /api/achievement`.
 */
export function createAchievementRoutes(db: Kysely<Database>) {
  const achievementRateLimiter = createRateLimiterMiddleware(
    db,
    achievementLimiter,
    'Rate limit exceeded',
  );
  return new Hono().post(
    '/',
    achievementRateLimiter,
    zValidator('json', AchievementPayloadSchema, zodErrorHook('Invalid achievement payload')),
    async (c) => {
      const payload = c.req.valid('json');

      const active = await isActivePuzzleSlot(db, payload.puzzle_number);
      if (!active) {
        return c.json({ error: 'Valittua peliä ei löydy tai se ei ole aktiivinen' }, 404);
      }

      await runImmediateTransactionWithRetry(db, (trx) => insertAchievement(trx, payload));

      return c.json({ status: 'recorded' as const }, 201);
    },
  );
}

/**
 * Mount `POST /api/failed-guess`.
 */
export function createFailedGuessRoutes(db: Kysely<Database>) {
  const failedGuessRateLimiter = createRateLimiterMiddleware(
    db,
    failedGuessLimiter,
    'Too many requests',
  );
  return new Hono().post(
    '/',
    failedGuessRateLimiter,
    zValidator(
      'json',
      FailedGuessPayloadSchema,
      zodErrorHook((err) => ({
        error: err.issues[0]?.path[0] === 'date' ? 'Invalid date' : 'Invalid word',
      })),
    ),
    async (c) => {
      const { word, date } = c.req.valid('json');

      const todayHelsinki = getHelsinkiDateString();
      if (date > todayHelsinki) {
        return c.json({ error: 'Invalid date' }, 400);
      }

      const normalized = word.toLowerCase().replace(/-/g, '');
      if (normalized.length < 4 || normalized.length > MAX_WORD_LENGTH) {
        return c.json({ error: 'Invalid word' }, 400);
      }

      const puzzleData = await getFullPuzzleForDate(db, date);
      if (!puzzleData) {
        return c.json({ error: 'Peliä ei löydy' }, 400);
      }

      if (!normalized.includes(puzzleData.center)) {
        return c.json({ error: 'Keskuskirjain puuttuu' }, 400);
      }

      const allowed = new Set([puzzleData.center, ...puzzleData.letters]);
      for (const ch of normalized) {
        if (!allowed.has(ch)) {
          return c.json({ error: 'Sana sisältää virheellisiä kirjaimia' }, 400);
        }
      }

      if (puzzleData.words.includes(normalized)) {
        return c.json({ error: 'Sana on jo ratkaisulistalla' }, 400);
      }

      await runImmediateTransactionWithRetry(db, (trx) => upsertFailedGuess(trx, normalized, date));

      return c.json({ ok: true as const }, 200);
    },
  );
}

/**
 * Mount `POST /api/word-find`.
 */
export function createWordFindRoutes(db: Kysely<Database>) {
  const wordFindRateLimiter = createRateLimiterMiddleware(db, wordFindLimiter, 'Too many requests');
  return new Hono().post(
    '/',
    wordFindRateLimiter,
    zValidator(
      'json',
      WordFindPayloadSchema,
      zodErrorHook((err) => ({
        error:
          err.issues[0]?.path[0] === 'puzzle_number' ? 'Invalid puzzle_number' : 'Invalid word',
      })),
    ),
    async (c) => {
      const { word, puzzle_number } = c.req.valid('json');

      const normalized = word.toLowerCase().replace(/-/g, '');
      if (normalized.length === 0) {
        return c.json({ error: 'Invalid word' }, 400);
      }

      const active = await isActivePuzzleSlot(db, puzzle_number);
      if (!active) {
        return c.json({ error: 'Valittua peliä ei löydy tai se ei ole aktiivinen' }, 400);
      }

      const puzzleData = await getFullPuzzleBySlot(db, puzzle_number);
      if (!puzzleData || !puzzleData.words.includes(normalized)) {
        return c.json({ error: 'Sana ei kuulu peliin' }, 400);
      }

      await runImmediateTransactionWithRetry(db, (trx) =>
        upsertWordFind(trx, normalized, puzzle_number),
      );

      return c.json({ ok: true as const }, 200);
    },
  );
}
