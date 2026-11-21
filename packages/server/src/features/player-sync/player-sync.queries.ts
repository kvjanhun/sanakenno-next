import {
  bestNoHintScoreForRecord,
  isPangram,
  rankForScore,
  type PlayerPreferences,
  type StatsRecord,
  type SyncPayload,
  type SyncProgressPayload,
  type SyncPuzzleState,
} from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getFullPuzzleBySlot } from '../puzzle/puzzle.queries.js';
import type { FullPuzzleData } from '../puzzle/wordlist.js';
import {
  bulkUpsertLocalData,
  parseStringArray,
  preloadBulkPuzzleMeta,
  puzzleDataToMeta,
  sanitizeAndMergePuzzleState,
  sanitizeAndMergeStatsRecord,
  type BulkPuzzleMeta,
} from './player-sync-bulk.queries.js';

export { bulkUpsertLocalData, preloadBulkPuzzleMeta, type BulkPuzzleMeta };

/**
 * Read and parse stored JSON preferences for a player, or null if absent/invalid.
 */
async function readPlayerPreferences(
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
async function readPuzzleState(
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
      'revealed',
    ])
    .where('player_id', '=', playerId)
    .where('puzzle_number', '=', puzzleNumber)
    .executeTakeFirst();

  if (!existing) return undefined;

  return {
    puzzle_number: puzzleNumber,
    found_words: parseStringArray(existing.found_words),
    score: Number(existing.score),
    hints_unlocked: parseStringArray(existing.hints_unlocked),
    started_at: Number(existing.started_at),
    total_paused_ms: Number(existing.total_paused_ms),
    score_before_hints:
      existing.score_before_hints !== null ? Number(existing.score_before_hints) : null,
    revealed: Boolean(existing.revealed),
  };
}

/**
 * Merge and store a single puzzle state for a player.
 */
export async function mergeAndStorePuzzleState(
  db: Kysely<Database>,
  playerId: number,
  incoming: SyncPuzzleState,
  preloadedPuzzle?: FullPuzzleData | null,
): Promise<SyncPuzzleState> {
  const puzzle =
    preloadedPuzzle !== undefined
      ? preloadedPuzzle
      : await getFullPuzzleBySlot(db, incoming.puzzle_number);
  const existing = await readPuzzleState(db, playerId, incoming.puzzle_number);
  const merged = sanitizeAndMergePuzzleState(existing, incoming, puzzleDataToMeta(puzzle));

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
        revealed: merged.revealed ? 1 : 0,
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
        revealed: merged.revealed ? 1 : 0,
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
      'long_words_count',
      'is_daily',
      'played_at_date',
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
    long_words_count: Number(existing.long_words_count ?? 0),
    is_daily: Boolean(existing.is_daily),
    played_at_date: existing.played_at_date ?? undefined,
  };
}

/**
 * Merge and store a single stats record for a player monotonically.
 */
export async function mergeAndStoreStatsRecord(
  db: Kysely<Database>,
  playerId: number,
  incoming: StatsRecord,
  preloadedPuzzle?: FullPuzzleData | null,
  preloadedExisting?: StatsRecord,
): Promise<StatsRecord> {
  const puzzle =
    preloadedPuzzle !== undefined
      ? preloadedPuzzle
      : await getFullPuzzleBySlot(db, incoming.puzzle_number);
  const existing =
    preloadedExisting !== undefined
      ? preloadedExisting
      : await readStatsRecord(db, playerId, incoming.puzzle_number);
  const merged = sanitizeAndMergeStatsRecord(existing, incoming, puzzleDataToMeta(puzzle));

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
        long_words_count: merged.long_words_count ?? 0,
        is_daily: merged.is_daily ? 1 : 0,
        played_at_date: merged.played_at_date ?? null,
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
        long_words_count: merged.long_words_count ?? 0,
        is_daily: merged.is_daily ? 1 : 0,
        played_at_date: merged.played_at_date ?? null,
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
  preloadedPuzzle?: FullPuzzleData | null,
): Promise<StatsRecord> {
  const puzzle =
    preloadedPuzzle !== undefined
      ? preloadedPuzzle
      : await getFullPuzzleBySlot(db, payload.puzzle_number);
  const allLetters = puzzle
    ? new Set<string>([puzzle.center, ...puzzle.letters])
    : new Set<string>();
  const maxScore = puzzle ? puzzle.max_score : payload.max_score;
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

  const longWordsCount = mergedState.found_words.filter((word) => word.length >= 10).length;
  const noHintCap =
    mergedState.hints_unlocked.length > 0
      ? (mergedState.score_before_hints ?? 0)
      : mergedState.score;
  const cappedClientNoHint = Math.min(payload.best_no_hint_score ?? 0, noHintCap);

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
    best_no_hint_score: Math.max(cappedClientNoHint, deriveBestNoHintScore(mergedState)),
    long_words_count: longWordsCount,
    is_daily: payload.is_daily,
    played_at_date: payload.played_at_date,
  };
}

/**
 * Fetch the full SyncPayload (stats, puzzle_states, preferences) for a player concurrently.
 */
export async function fetchPlayerData(
  db: Kysely<Database>,
  playerId: number,
): Promise<SyncPayload> {
  const [statsRows, stateRows, preferences] = await Promise.all([
    db
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
        'long_words_count',
        'is_daily',
        'played_at_date',
      ])
      .where('player_id', '=', playerId)
      .execute(),
    db
      .selectFrom('player_puzzle_states')
      .select([
        'puzzle_number',
        'found_words',
        'score',
        'hints_unlocked',
        'started_at',
        'total_paused_ms',
        'score_before_hints',
        'revealed',
      ])
      .where('player_id', '=', playerId)
      .execute(),
    readPlayerPreferences(db, playerId),
  ]);

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
        long_words_count: Number(r.long_words_count ?? 0),
        is_daily: Boolean(r.is_daily),
        played_at_date: r.played_at_date ?? undefined,
      })),
      version: 1,
    },
    puzzle_states: stateRows.map((r) => ({
      puzzle_number: Number(r.puzzle_number),
      found_words: parseStringArray(r.found_words),
      score: Number(r.score),
      hints_unlocked: parseStringArray(r.hints_unlocked),
      started_at: Number(r.started_at),
      total_paused_ms: Number(r.total_paused_ms),
      score_before_hints: r.score_before_hints !== null ? Number(r.score_before_hints) : null,
      revealed: Boolean(r.revealed),
    })),
    preferences,
  };
}
