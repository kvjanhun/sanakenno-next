import {
  deriveStatsRecordFromState,
  type CanonicalPuzzleState,
  type PlayerPreferences,
  type PuzzleMetaForStats,
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
  chunkArray,
  parseFrozenStats,
  parseStringArray,
  preloadBulkPuzzleMeta,
  puzzleDataToMeta,
  sanitizeAndMergePuzzleState,
  type BulkPuzzleMeta,
} from './player-sync-bulk.queries.js';

export { bulkUpsertLocalData, preloadBulkPuzzleMeta, type BulkPuzzleMeta };

const PUZZLE_META_CHUNK_SIZE = 500;

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
 * Fetch a single canonical puzzle state row for a player and puzzle slot.
 */
async function readCanonicalPuzzleState(
  db: Kysely<Database>,
  playerId: number,
  puzzleNumber: number,
): Promise<CanonicalPuzzleState | undefined> {
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
      'date',
      'max_score',
      'is_daily',
      'played_at_date',
      'elapsed_ms',
      'frozen_stats_json',
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
    date: existing.date,
    max_score: Number(existing.max_score),
    is_daily: Boolean(existing.is_daily),
    played_at_date: existing.played_at_date,
    elapsed_ms: Number(existing.elapsed_ms),
    frozen_stats: parseFrozenStats(existing.frozen_stats_json),
  };
}

function resolveCanonicalIsDaily(
  existing: CanonicalPuzzleState | undefined,
  incoming: SyncProgressPayload,
  hasFoundWords: boolean,
): boolean {
  if (!hasFoundWords) return false;
  if (existing?.is_daily || incoming.is_daily === true) return true;
  if (incoming.is_daily === false) return false;
  if (incoming.played_at_date !== undefined) {
    return incoming.played_at_date === incoming.date;
  }
  // Existing row with explicit is_daily = false stays archive on partial updates
  if (existing && existing.found_words.length > 0) {
    return Boolean(existing.is_daily);
  }
  return true;
}

/**
 * Merge and store a player's progress into the single canonical `player_puzzle_states` table.
 * Freezes pre-reveal stats in `frozen_stats_json` when transitioning `revealed: false -> true`.
 */
export async function upsertCanonicalPuzzleProgress(
  db: Kysely<Database>,
  playerId: number,
  payload: SyncProgressPayload,
  preloadedPuzzle?: FullPuzzleData | null,
): Promise<CanonicalPuzzleState> {
  const puzzle =
    preloadedPuzzle !== undefined
      ? preloadedPuzzle
      : await getFullPuzzleBySlot(db, payload.puzzle_number);
  const meta = puzzleDataToMeta(puzzle);
  const existing = await readCanonicalPuzzleState(db, playerId, payload.puzzle_number);
  const mergedState = sanitizeAndMergePuzzleState(existing, payload, meta);

  const wasRevealed = Boolean(existing?.revealed);
  const isNowRevealed = Boolean(mergedState.revealed);
  let frozenStats = existing?.frozen_stats ?? null;
  let date = existing?.date ?? null;
  let maxScore = meta ? meta.maxScore : Math.max(existing?.max_score ?? 0, payload.max_score);
  let isDaily = Boolean(existing?.is_daily);
  let playedAtDate = existing?.played_at_date ?? null;
  let elapsedMs = existing?.elapsed_ms ?? 0;

  if (!wasRevealed && isNowRevealed) {
    frozenStats = existing ? deriveStatsRecordFromState(existing, meta) : null;
  } else if (!isNowRevealed) {
    const activeElapsed =
      mergedState.started_at > 0
        ? Math.max(0, Date.now() - mergedState.started_at - mergedState.total_paused_ms)
        : 0;
    date = date || payload.date;
    maxScore = meta ? meta.maxScore : Math.max(existing?.max_score ?? 0, payload.max_score);
    isDaily = resolveCanonicalIsDaily(existing, payload, mergedState.found_words.length > 0);
    playedAtDate = payload.played_at_date ?? playedAtDate;
    elapsedMs = Math.max(elapsedMs, activeElapsed);
  }

  const canonical: CanonicalPuzzleState = {
    ...mergedState,
    revealed: isNowRevealed,
    date,
    max_score: maxScore,
    is_daily: isDaily,
    played_at_date: playedAtDate,
    elapsed_ms: elapsedMs,
    frozen_stats: frozenStats,
  };

  if (!existing) {
    await db
      .insertInto('player_puzzle_states')
      .values({
        player_id: playerId,
        puzzle_number: canonical.puzzle_number,
        found_words: JSON.stringify(canonical.found_words),
        score: canonical.score,
        hints_unlocked: JSON.stringify(canonical.hints_unlocked),
        started_at: canonical.started_at,
        total_paused_ms: canonical.total_paused_ms,
        score_before_hints: canonical.score_before_hints ?? null,
        revealed: canonical.revealed ? 1 : 0,
        date: canonical.date ?? null,
        max_score: canonical.max_score ?? 0,
        is_daily: canonical.is_daily ? 1 : 0,
        played_at_date: canonical.played_at_date ?? null,
        elapsed_ms: canonical.elapsed_ms ?? 0,
        frozen_stats_json: canonical.frozen_stats ? JSON.stringify(canonical.frozen_stats) : null,
      })
      .execute();
  } else {
    await db
      .updateTable('player_puzzle_states')
      .set({
        found_words: JSON.stringify(canonical.found_words),
        score: canonical.score,
        hints_unlocked: JSON.stringify(canonical.hints_unlocked),
        started_at: canonical.started_at,
        total_paused_ms: canonical.total_paused_ms,
        score_before_hints: canonical.score_before_hints ?? null,
        revealed: canonical.revealed ? 1 : 0,
        date: canonical.date ?? null,
        max_score: canonical.max_score ?? 0,
        is_daily: canonical.is_daily ? 1 : 0,
        played_at_date: canonical.played_at_date ?? null,
        elapsed_ms: canonical.elapsed_ms ?? 0,
        frozen_stats_json: canonical.frozen_stats ? JSON.stringify(canonical.frozen_stats) : null,
        updated_at: sql<string>`datetime('now')`,
      })
      .where('player_id', '=', playerId)
      .where('puzzle_number', '=', canonical.puzzle_number)
      .execute();
  }

  return canonical;
}

/**
 * Fetch the full SyncPayload (`stats`, `puzzle_states`, `preferences`) for a player
 * by reading `player_puzzle_states` and deriving `stats.records` deterministically.
 */
export async function fetchPlayerData(
  db: Kysely<Database>,
  playerId: number,
): Promise<SyncPayload> {
  const [stateRows, preferences] = await Promise.all([
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
        'date',
        'max_score',
        'is_daily',
        'played_at_date',
        'elapsed_ms',
        'frozen_stats_json',
      ])
      .where('player_id', '=', playerId)
      .execute(),
    readPlayerPreferences(db, playerId),
  ]);

  const metaBySlot = new Map<number, PuzzleMetaForStats>();
  if (stateRows.length > 0) {
    const slots = Array.from(new Set(stateRows.map((r) => Number(r.puzzle_number))));
    const chunks = chunkArray(slots, PUZZLE_META_CHUNK_SIZE);
    const puzzleRowChunks = await Promise.all(
      chunks.map((slotChunk) =>
        db
          .selectFrom('puzzles')
          .select(['slot', 'letters', 'center', 'max_score'])
          .where('slot', 'in', slotChunk)
          .execute(),
      ),
    );
    for (const rows of puzzleRowChunks) {
      for (const row of rows) {
        const allLetters = new Set(
          row.letters
            .split(',')
            .map((l) => l.trim().toLowerCase())
            .filter(Boolean),
        );
        allLetters.add(row.center.trim().toLowerCase());
        metaBySlot.set(Number(row.slot), {
          allLetters,
          maxScore: Number(row.max_score ?? 0),
        });
      }
    }
  }

  const statsRecords: StatsRecord[] = [];
  const puzzleStates: SyncPuzzleState[] = [];

  for (const r of stateRows) {
    const puzzleNumber = Number(r.puzzle_number);
    const foundWords = parseStringArray(r.found_words);
    const hintsUnlocked = parseStringArray(r.hints_unlocked);
    const startedAt = Number(r.started_at);
    const revealed = Boolean(r.revealed);
    const frozenStats = parseFrozenStats(r.frozen_stats_json);

    const canonical: CanonicalPuzzleState = {
      puzzle_number: puzzleNumber,
      found_words: foundWords,
      score: Number(r.score),
      hints_unlocked: hintsUnlocked,
      started_at: startedAt,
      total_paused_ms: Number(r.total_paused_ms),
      score_before_hints: r.score_before_hints !== null ? Number(r.score_before_hints) : null,
      revealed,
      date: r.date,
      max_score: Number(r.max_score),
      is_daily: Boolean(r.is_daily),
      played_at_date: r.played_at_date,
      elapsed_ms: Number(r.elapsed_ms),
      frozen_stats: frozenStats,
    };

    const puzzleMeta = metaBySlot.get(puzzleNumber) ?? null;
    const effectiveMeta =
      puzzleMeta && puzzleMeta.maxScore > 0
        ? puzzleMeta
        : puzzleMeta
          ? {
              allLetters: puzzleMeta.allLetters,
              maxScore: Math.max(canonical.max_score ?? 0, canonical.score),
            }
          : null;

    const derived = deriveStatsRecordFromState(canonical, effectiveMeta);
    if (derived) {
      statsRecords.push(derived);
    }

    if (foundWords.length > 0 || hintsUnlocked.length > 0 || startedAt > 0 || revealed) {
      puzzleStates.push({
        puzzle_number: puzzleNumber,
        found_words: foundWords,
        score: canonical.score,
        hints_unlocked: hintsUnlocked,
        started_at: startedAt,
        total_paused_ms: canonical.total_paused_ms,
        score_before_hints: canonical.score_before_hints,
        revealed,
      });
    }
  }

  return {
    stats: {
      records: statsRecords,
      version: 1,
    },
    puzzle_states: puzzleStates,
    preferences,
  };
}
