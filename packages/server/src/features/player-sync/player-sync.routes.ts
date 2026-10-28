import type { SyncProgressPayload } from '@sanakenno/shared';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import { runImmediateTransactionWithRetry } from '../../db/connection.js';
import type { Database } from '../../db/schema.js';
import { requirePlayerAuth, type PlayerVariables } from '../player-auth/player-auth.middleware.js';
import {
  deriveStatsFromProgress,
  fetchPlayerData,
  mergeAndStorePuzzleState,
  mergeAndStoreStatsRecord,
  sanitizePreferences,
  upsertPlayerPreferences,
} from './player-sync.queries.js';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sanitizeProgressPayload(body: Record<string, unknown>): SyncProgressPayload | null {
  const puzzleNumber = body['puzzle_number'];
  const date = body['date'];
  const foundWords = body['found_words'];
  const score = body['score'];
  const hintsUnlocked = body['hints_unlocked'];
  const startedAt = body['started_at'];
  const totalPausedMs = body['total_paused_ms'];
  const scoreBeforeHints = body['score_before_hints'];
  const maxScore = body['max_score'];
  const bestNoHintScore = body['best_no_hint_score'];

  if (
    typeof puzzleNumber !== 'number' ||
    typeof date !== 'string' ||
    !isStringArray(foundWords) ||
    typeof score !== 'number' ||
    !isStringArray(hintsUnlocked) ||
    typeof startedAt !== 'number' ||
    typeof totalPausedMs !== 'number' ||
    !(scoreBeforeHints === null || typeof scoreBeforeHints === 'number') ||
    typeof maxScore !== 'number' ||
    !(bestNoHintScore === undefined || typeof bestNoHintScore === 'number')
  ) {
    return null;
  }

  return {
    puzzle_number: puzzleNumber,
    date,
    found_words: foundWords,
    score,
    hints_unlocked: hintsUnlocked,
    started_at: startedAt,
    total_paused_ms: totalPausedMs,
    score_before_hints: scoreBeforeHints,
    max_score: maxScore,
    ...(typeof bestNoHintScore === 'number' ? { best_no_hint_score: bestNoHintScore } : {}),
  };
}

/**
 * Mount chained `/api/player/sync` routes for pulling and pushing player progress.
 */
export function createPlayerSyncRoutes(db: Kysely<Database>) {
  const authMiddleware = requirePlayerAuth(db);

  return new Hono<{ Variables: PlayerVariables }>()
    .get('/', authMiddleware, async (c) => {
      const player = c.get('player');
      const data = await fetchPlayerData(db, player.playerId);
      return c.json(data, 200);
    })
    .post('/stats', authMiddleware, async (c) => {
      const player = c.get('player');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // Ignore malformed JSON and validate fields below.
      }

      const puzzle_number = body['puzzle_number'] as number | undefined;
      const date = body['date'] as string | undefined;
      const best_rank = body['best_rank'] as string | undefined;
      const best_score = body['best_score'] as number | undefined;
      const max_score = body['max_score'] as number | undefined;
      const words_found = body['words_found'] as number | undefined;
      const hints_used = body['hints_used'] as number | undefined;
      const elapsed_ms = body['elapsed_ms'] as number | undefined;
      const longest_word = typeof body['longest_word'] === 'string' ? body['longest_word'] : null;
      const pangrams_found =
        typeof body['pangrams_found'] === 'number' ? body['pangrams_found'] : 0;
      const best_no_hint_score =
        typeof body['best_no_hint_score'] === 'number' ? body['best_no_hint_score'] : undefined;

      if (
        typeof puzzle_number !== 'number' ||
        typeof date !== 'string' ||
        typeof best_rank !== 'string' ||
        typeof best_score !== 'number'
      ) {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      await runImmediateTransactionWithRetry(db, (trx) =>
        mergeAndStoreStatsRecord(trx, player.playerId, {
          puzzle_number,
          date,
          best_rank,
          best_score: best_score ?? 0,
          max_score: max_score ?? 0,
          words_found: words_found ?? 0,
          hints_used: hints_used ?? 0,
          elapsed_ms: elapsed_ms ?? 0,
          longest_word: longest_word ?? undefined,
          pangrams_found,
          ...(typeof best_no_hint_score === 'number' ? { best_no_hint_score } : {}),
        }),
      );

      return c.json({ status: 'synced' as const }, 200);
    })
    .post('/state', authMiddleware, async (c) => {
      const player = c.get('player');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // Ignore malformed JSON and validate fields below.
      }

      const puzzle_number = body['puzzle_number'] as number | undefined;
      const found_words = body['found_words'] as string[] | undefined;
      const score = body['score'] as number | undefined;
      const hints_unlocked = body['hints_unlocked'] as string[] | undefined;
      const started_at = body['started_at'] as number | undefined;
      const total_paused_ms = body['total_paused_ms'] as number | undefined;
      const score_before_hints = body['score_before_hints'] as number | null | undefined;

      if (typeof puzzle_number !== 'number' || !isStringArray(found_words)) {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      await runImmediateTransactionWithRetry(db, (trx) =>
        mergeAndStorePuzzleState(trx, player.playerId, {
          puzzle_number,
          found_words,
          score: score ?? 0,
          hints_unlocked: isStringArray(hints_unlocked) ? hints_unlocked : [],
          started_at: started_at ?? 0,
          total_paused_ms: total_paused_ms ?? 0,
          score_before_hints: score_before_hints ?? null,
        }),
      );

      return c.json({ status: 'synced' as const }, 200);
    })
    .post('/progress', authMiddleware, async (c) => {
      const player = c.get('player');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // Ignore malformed JSON and validate fields below.
      }

      const payload = sanitizeProgressPayload(body);
      if (!payload) {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      await runImmediateTransactionWithRetry(db, async (trx) => {
        const mergedState = await mergeAndStorePuzzleState(trx, player.playerId, payload);
        const derivedStats = await deriveStatsFromProgress(trx, payload, mergedState);
        await mergeAndStoreStatsRecord(trx, player.playerId, derivedStats);
      });

      return c.json({ status: 'synced' as const }, 200);
    })
    .post('/preferences', authMiddleware, async (c) => {
      const player = c.get('player');
      let body: Record<string, unknown> = {};
      try {
        body = await c.req.json();
      } catch {
        // Ignore malformed JSON and validate fields below.
      }

      const incoming = sanitizePreferences(body);
      if (!incoming) {
        return c.json({ error: 'Virheellinen pyyntö' }, 400);
      }

      const result = await runImmediateTransactionWithRetry(db, (trx) =>
        upsertPlayerPreferences(trx, player.playerId, incoming),
      );

      return c.json(result, 200);
    });
}
