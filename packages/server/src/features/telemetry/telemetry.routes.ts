import { getHelsinkiDateString, RANK_NAMES, type RankName } from '@sanakenno/shared';
import { Hono, type Context, type Next } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { getRateLimitKey, SlidingWindowRateLimiter } from '../player-auth/rate-limiter.js';
import { getFullPuzzleBySlot, getFullPuzzleForDate } from '../puzzle/puzzle.queries.js';
import {
  insertAchievement,
  isActivePuzzleSlot,
  upsertFailedGuess,
  upsertWordFind,
} from './telemetry.queries.js';

const MAX_WORD_LENGTH = 20;
const VALID_RANKS: readonly string[] = RANK_NAMES;

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

function createRateLimiterMiddleware(limiter: SlidingWindowRateLimiter, errorMessage: string) {
  return (c: Context, next: Next) => {
    const key = getRateLimitKey(c);
    if (!limiter.isAllowed(key)) {
      return c.json({ error: errorMessage }, 429);
    }
    return next();
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const achievementRateLimiter = createRateLimiterMiddleware(
  achievementLimiter,
  'Rate limit exceeded',
);
const failedGuessRateLimiter = createRateLimiterMiddleware(failedGuessLimiter, 'Too many requests');
const wordFindRateLimiter = createRateLimiterMiddleware(wordFindLimiter, 'Too many requests');

/**
 * Mount `POST /api/achievement`.
 */
export function createAchievementRoutes(db: Kysely<Database>) {
  return new Hono().post('/', achievementRateLimiter, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const puzzle_number = body['puzzle_number'];
    const rank = body['rank'];
    const score = body['score'];
    const max_score = body['max_score'];
    const words_found = body['words_found'];
    const elapsed_ms = body['elapsed_ms'];
    const session_id = body['session_id'];

    if (
      puzzle_number === undefined ||
      rank === undefined ||
      score === undefined ||
      max_score === undefined ||
      words_found === undefined
    ) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    if (typeof rank !== 'string' || !VALID_RANKS.includes(rank)) {
      return c.json({ error: 'Invalid rank' }, 400);
    }

    if (
      !isNonNegativeInteger(puzzle_number) ||
      !isNonNegativeInteger(score) ||
      !isNonNegativeInteger(max_score) ||
      !isNonNegativeInteger(words_found)
    ) {
      return c.json({ error: 'Numeric fields must be non-negative integers' }, 400);
    }

    if (elapsed_ms !== undefined && !isNonNegativeInteger(elapsed_ms)) {
      return c.json({ error: 'elapsed_ms must be a non-negative integer' }, 400);
    }

    const active = await isActivePuzzleSlot(db, puzzle_number);
    if (!active) {
      return c.json({ error: 'Valittua peliä ei löydy tai se ei ole aktiivinen' }, 404);
    }

    await runImmediateTransactionWithRetry(db, (trx) =>
      insertAchievement(trx, {
        puzzle_number,
        rank: rank as RankName,
        score,
        max_score,
        words_found,
        elapsed_ms: typeof elapsed_ms === 'number' ? elapsed_ms : undefined,
        session_id: typeof session_id === 'string' ? session_id : undefined,
      }),
    );

    return c.json({ status: 'recorded' as const }, 201);
  });
}

/**
 * Mount `POST /api/failed-guess`.
 */
export function createFailedGuessRoutes(db: Kysely<Database>) {
  return new Hono().post('/', failedGuessRateLimiter, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const word = body['word'];
    const date = body['date'];

    if (typeof word !== 'string' || word.length === 0 || word.length > MAX_WORD_LENGTH) {
      return c.json({ error: 'Invalid word' }, 400);
    }

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'Invalid date' }, 400);
    }

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
  });
}

/**
 * Mount `POST /api/word-find`.
 */
export function createWordFindRoutes(db: Kysely<Database>) {
  return new Hono().post('/', wordFindRateLimiter, async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    const word = body['word'];
    const puzzle_number = body['puzzle_number'];

    if (typeof word !== 'string' || word.length === 0 || word.length > MAX_WORD_LENGTH) {
      return c.json({ error: 'Invalid word' }, 400);
    }

    if (!isNonNegativeInteger(puzzle_number)) {
      return c.json({ error: 'Invalid puzzle_number' }, 400);
    }

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
  });
}
