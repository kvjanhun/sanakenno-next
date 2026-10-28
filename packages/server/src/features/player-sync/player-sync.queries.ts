import {
  bestNoHintScoreForRecord,
  isPangram,
  mergePuzzleState,
  mergeStatsRecord,
  rankForScore,
  THEME_IDS,
  type PlayerPreferences,
  type PlayerStats,
  type StatsRecord,
  type SyncPayload,
  type SyncProgressPayload,
  type SyncPuzzleState,
  type ThemeId,
  type ThemePreference,
} from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getFullPuzzleBySlot } from '../puzzle/puzzle.queries.js';

/**
 * Read and parse stored JSON preferences for a player, or null if absent/invalid.
 */
export async function readPlayerPreferences(
  db: Kysely<Database>,
  playerId: number,
): Promise<PlayerPreferences | null> {
  const row = await db
    .selectFrom('players')
    .select('preferences')
    .where('id', '=', playerId)
    .executeTakeFirst();

  if (!row?.preferences) return null;
  try {
    return JSON.parse(row.preferences) as PlayerPreferences;
  } catch {
    return null;
  }
}

/**
 * Validate and sanitize raw preferences body.
 */
export function sanitizePreferences(body: Record<string, unknown>): PlayerPreferences | null {
  const themeIdRaw = body['themeId'];
  const themePrefRaw = body['themePreference'];
  const updatedAtRaw = body['updated_at'];

  let themeId: ThemeId | undefined;
  if (typeof themeIdRaw === 'string' && (THEME_IDS as readonly string[]).includes(themeIdRaw)) {
    themeId = themeIdRaw as ThemeId;
  }

  let themePreference: ThemePreference | undefined;
  if (themePrefRaw === 'light' || themePrefRaw === 'dark' || themePrefRaw === 'system') {
    themePreference = themePrefRaw;
  }

  if (typeof updatedAtRaw !== 'string' || Number.isNaN(Date.parse(updatedAtRaw))) {
    return null;
  }

  return {
    themeId,
    themePreference,
    updated_at: updatedAtRaw,
  };
}

/**
 * Upsert player preferences using last-write-wins by `updated_at`.
 */
export async function upsertPlayerPreferences(
  db: Kysely<Database>,
  playerId: number,
  incoming: PlayerPreferences,
): Promise<{ status: 'synced' | 'kept'; preferences: PlayerPreferences }> {
  const existing = await readPlayerPreferences(db, playerId);
  if (existing && Date.parse(existing.updated_at) > Date.parse(incoming.updated_at)) {
    return { status: 'kept', preferences: existing };
  }

  await db
    .updateTable('players')
    .set({
      preferences: JSON.stringify(incoming),
      updated_at: sql<string>`datetime('now')`,
    })
    .where('id', '=', playerId)
    .execute();

  return { status: 'synced', preferences: incoming };
}

/**
 * Fetch a single puzzle state for a player and puzzle slot.
 */
export async function readPuzzleState(
  db: Kysely<Database>,
  playerId: number,
  puzzleNumber: number,
): Promise<SyncPuzzleState | undefined> {
  const existing = await db
    .selectFrom('player_puzzle_states')
    .select([
      'found_words',
      'score',
      'hints_unlocked',
      'started_at',
      'total_paused_ms',
      'score_before_hints',
    ])
    .where('player_id', '=', playerId)
    .where('puzzle_number', '=', puzzleNumber)
    .executeTakeFirst();

  if (!existing) return undefined;

  return {
    puzzle_number: puzzleNumber,
    found_words: JSON.parse(existing.found_words) as string[],
    score: Number(existing.score),
    hints_unlocked: JSON.parse(existing.hints_unlocked) as string[],
    started_at: Number(existing.started_at),
    total_paused_ms: Number(existing.total_paused_ms),
    score_before_hints:
      existing.score_before_hints !== null ? Number(existing.score_before_hints) : null,
  };
}

/**
 * Merge and store a single puzzle state for a player.
 */
export async function mergeAndStorePuzzleState(
  db: Kysely<Database>,
  playerId: number,
  incoming: SyncPuzzleState,
): Promise<SyncPuzzleState> {
  const existing = await readPuzzleState(db, playerId, incoming.puzzle_number);
  const merged = existing ? mergePuzzleState(existing, incoming) : incoming;

  if (!existing) {
    await db
      .insertInto('player_puzzle_states')
      .values({
        player_id: playerId,
        puzzle_number: merged.puzzle_number,
        found_words: JSON.stringify(merged.found_words),
        score: merged.score,
        hints_unlocked: JSON.stringify(merged.hints_unlocked),
        started_at: merged.started_at,
        total_paused_ms: merged.total_paused_ms,
        score_before_hints: merged.score_before_hints ?? null,
      })
      .execute();
  } else {
    await db
      .updateTable('player_puzzle_states')
      .set({
        found_words: JSON.stringify(merged.found_words),
        score: merged.score,
        hints_unlocked: JSON.stringify(merged.hints_unlocked),
        started_at: merged.started_at,
        total_paused_ms: merged.total_paused_ms,
        score_before_hints: merged.score_before_hints ?? null,
        updated_at: sql<string>`datetime('now')`,
      })
      .where('player_id', '=', playerId)
      .where('puzzle_number', '=', merged.puzzle_number)
      .execute();
  }

  return merged;
}

/**
 * Fetch a single stats record for a player and puzzle slot.
 */
export async function readStatsRecord(
  db: Kysely<Database>,
  playerId: number,
  puzzleNumber: number,
): Promise<StatsRecord | undefined> {
  const existing = await db
    .selectFrom('player_stats')
    .select([
      'date',
      'best_rank',
      'best_score',
      'max_score',
      'words_found',
      'hints_used',
      'elapsed_ms',
      'longest_word',
      'pangrams_found',
      'best_no_hint_score',
    ])
    .where('player_id', '=', playerId)
    .where('puzzle_number', '=', puzzleNumber)
    .executeTakeFirst();

  if (!existing) return undefined;

  return {
    puzzle_number: puzzleNumber,
    date: existing.date,
    best_rank: existing.best_rank,
    best_score: Number(existing.best_score),
    max_score: Number(existing.max_score),
    words_found: Number(existing.words_found),
    hints_used: Number(existing.hints_used),
    elapsed_ms: Number(existing.elapsed_ms),
    longest_word: existing.longest_word ?? undefined,
    pangrams_found: Number(existing.pangrams_found),
    best_no_hint_score: Number(existing.best_no_hint_score),
  };
}

/**
 * Merge and store a single stats record for a player monotonically.
 */
export async function mergeAndStoreStatsRecord(
  db: Kysely<Database>,
  playerId: number,
  incoming: StatsRecord,
): Promise<StatsRecord> {
  const existing = await readStatsRecord(db, playerId, incoming.puzzle_number);
  const merged: StatsRecord = existing
    ? {
        ...mergeStatsRecord(existing, incoming),
        max_score: Math.max(existing.max_score, incoming.max_score),
      }
    : incoming;

  const longestWordOrNull =
    merged.longest_word && merged.longest_word.length > 0 ? merged.longest_word : null;
  const bestNoHint = bestNoHintScoreForRecord(merged);

  if (!existing) {
    await db
      .insertInto('player_stats')
      .values({
        player_id: playerId,
        puzzle_number: merged.puzzle_number,
        date: merged.date,
        best_rank: merged.best_rank,
        best_score: merged.best_score,
        max_score: merged.max_score,
        words_found: merged.words_found,
        hints_used: merged.hints_used,
        elapsed_ms: merged.elapsed_ms,
        longest_word: longestWordOrNull,
        pangrams_found: merged.pangrams_found ?? 0,
        best_no_hint_score: bestNoHint,
      })
      .execute();
  } else {
    await db
      .updateTable('player_stats')
      .set({
        date: merged.date,
        best_rank: merged.best_rank,
        best_score: merged.best_score,
        max_score: merged.max_score,
        words_found: merged.words_found,
        hints_used: merged.hints_used,
        elapsed_ms: merged.elapsed_ms,
        longest_word: longestWordOrNull,
        pangrams_found: merged.pangrams_found ?? 0,
        best_no_hint_score: bestNoHint,
        updated_at: sql<string>`datetime('now')`,
      })
      .where('player_id', '=', playerId)
      .where('puzzle_number', '=', merged.puzzle_number)
      .execute();
  }

  return merged;
}

function deriveBestNoHintScore(mergedState: SyncPuzzleState): number {
  if (mergedState.hints_unlocked.length === 0) return mergedState.score;
  return mergedState.score_before_hints ?? 0;
}

/**
 * Derive a StatsRecord from a combined progress payload and its merged puzzle state.
 */
export async function deriveStatsFromProgress(
  db: Kysely<Database>,
  payload: SyncProgressPayload,
  mergedState: SyncPuzzleState,
): Promise<StatsRecord> {
  const puzzle = await getFullPuzzleBySlot(db, payload.puzzle_number);
  const allLetters = puzzle
    ? new Set<string>([puzzle.center, ...puzzle.letters])
    : new Set<string>();
  const maxScore = payload.max_score > 0 ? payload.max_score : (puzzle?.max_score ?? 0);
  const longestWord = mergedState.found_words.reduce(
    (longest, word) => (word.length > longest.length ? word : longest),
    '',
  );
  const pangramsFound =
    allLetters.size > 0
      ? mergedState.found_words.filter((word) => isPangram(word, allLetters)).length
      : 0;
  const elapsedMs =
    mergedState.started_at > 0
      ? Math.max(0, Date.now() - mergedState.started_at - mergedState.total_paused_ms)
      : 0;

  return {
    puzzle_number: payload.puzzle_number,
    date: payload.date,
    best_rank: rankForScore(mergedState.score, maxScore),
    best_score: mergedState.score,
    max_score: maxScore,
    words_found: mergedState.found_words.length,
    hints_used: mergedState.hints_unlocked.length,
    elapsed_ms: elapsedMs,
    longest_word: longestWord,
    pangrams_found: pangramsFound,
    best_no_hint_score: Math.max(
      payload.best_no_hint_score ?? 0,
      deriveBestNoHintScore(mergedState),
    ),
  };
}

/**
 * Fetch the full SyncPayload (stats, puzzle_states, preferences) for a player.
 */
export async function fetchPlayerData(
  db: Kysely<Database>,
  playerId: number,
): Promise<SyncPayload> {
  const statsRows = await db
    .selectFrom('player_stats')
    .select([
      'puzzle_number',
      'date',
      'best_rank',
      'best_score',
      'max_score',
      'words_found',
      'hints_used',
      'elapsed_ms',
      'longest_word',
      'pangrams_found',
      'best_no_hint_score',
    ])
    .where('player_id', '=', playerId)
    .execute();

  const stateRows = await db
    .selectFrom('player_puzzle_states')
    .select([
      'puzzle_number',
      'found_words',
      'score',
      'hints_unlocked',
      'started_at',
      'total_paused_ms',
      'score_before_hints',
    ])
    .where('player_id', '=', playerId)
    .execute();

  const preferences = await readPlayerPreferences(db, playerId);

  return {
    stats: {
      records: statsRows.map((r) => ({
        puzzle_number: Number(r.puzzle_number),
        date: r.date,
        best_rank: r.best_rank,
        best_score: Number(r.best_score),
        max_score: Number(r.max_score),
        words_found: Number(r.words_found),
        hints_used: Number(r.hints_used),
        elapsed_ms: Number(r.elapsed_ms),
        longest_word: r.longest_word ?? undefined,
        pangrams_found: Number(r.pangrams_found),
        best_no_hint_score: Number(r.best_no_hint_score),
      })),
      version: 1,
    },
    puzzle_states: stateRows.map((r) => ({
      puzzle_number: Number(r.puzzle_number),
      found_words: JSON.parse(r.found_words) as string[],
      score: Number(r.score),
      hints_unlocked: JSON.parse(r.hints_unlocked) as string[],
      started_at: Number(r.started_at),
      total_paused_ms: Number(r.total_paused_ms),
      score_before_hints: r.score_before_hints !== null ? Number(r.score_before_hints) : null,
    })),
    preferences,
  };
}

/**
 * Bulk upsert client stats and puzzle states when pairing a device via `/auth/transfer/use`.
 */
export async function bulkUpsertLocalData(
  db: Kysely<Database>,
  playerId: number,
  stats: PlayerStats | undefined,
  puzzleStates: SyncPuzzleState[] | undefined,
): Promise<void> {
  if (stats?.records?.length) {
    for (const record of stats.records) {
      await mergeAndStoreStatsRecord(db, playerId, record);
    }
  }
  if (puzzleStates?.length) {
    for (const state of puzzleStates) {
      await mergeAndStorePuzzleState(db, playerId, state);
    }
  }
}
