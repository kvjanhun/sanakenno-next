import {
  bestNoHintScoreForRecord,
  mergePuzzleState,
  mergeStatsRecord,
  rankForScore,
  recalcScore,
  type PlayerStats,
  type StatsRecord,
  type SyncPuzzleState,
} from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getBlockedWords } from '../puzzle/puzzle.queries.js';
import { computePuzzle, type FullPuzzleData } from '../puzzle/wordlist.js';

const STATS_UPSERT_CHUNK_SIZE = 40;
const STATE_UPSERT_CHUNK_SIZE = 50;
const SLOT_IN_QUERY_CHUNK_SIZE = 500;

export interface BulkPuzzleMeta {
  allLetters: Set<string>;
  validWords: Set<string>;
  maxScore: number;
  wordCount: number;
  pangramCount: number;
}

export function puzzleDataToMeta(puzzle: FullPuzzleData | null): BulkPuzzleMeta | null {
  if (!puzzle) return null;
  return {
    allLetters: new Set<string>([puzzle.center, ...puzzle.letters]),
    validWords: new Set<string>(puzzle.words),
    maxScore: puzzle.max_score,
    wordCount: puzzle.words.length,
    pangramCount: puzzle.hint_data.pangram_count,
  };
}

function capScoreBeforeHints(
  val: number | null,
  score: number,
  hintsUnlockedCount: number,
): number | null {
  if (hintsUnlockedCount === 0) return null;
  return val !== null ? Math.min(val, score) : null;
}

/**
 * Sanitize incoming puzzle state against authoritative puzzle words/letters and merge monotonically.
 */
export function sanitizeAndMergePuzzleState(
  existing: SyncPuzzleState | undefined,
  incoming: SyncPuzzleState,
  meta: Pick<BulkPuzzleMeta, 'allLetters' | 'validWords'> | null,
): SyncPuzzleState {
  let sanitizedIncoming = incoming;
  if (meta) {
    const validWords = Array.from(
      new Set(
        incoming.found_words
          .map((word) => word.trim().toLowerCase().replaceAll('-', ''))
          .filter((word) => meta.validWords.has(word)),
      ),
    );
    const recalculatedScore = recalcScore(validWords, meta.allLetters);
    sanitizedIncoming = {
      ...incoming,
      found_words: validWords,
      score: recalculatedScore,
      score_before_hints: capScoreBeforeHints(
        incoming.score_before_hints,
        recalculatedScore,
        incoming.hints_unlocked.length,
      ),
    };
  }

  const mergedRaw = existing ? mergePuzzleState(existing, sanitizedIncoming) : sanitizedIncoming;
  if (!meta) return mergedRaw;

  const mergedScore = recalcScore(mergedRaw.found_words, meta.allLetters);
  return {
    ...mergedRaw,
    score: mergedScore,
    score_before_hints: capScoreBeforeHints(
      mergedRaw.score_before_hints,
      mergedScore,
      mergedRaw.hints_unlocked.length,
    ),
  };
}

/**
 * Sanitize incoming stats record against authoritative puzzle bounds and merge monotonically.
 */
export function sanitizeAndMergeStatsRecord(
  existing: StatsRecord | undefined,
  incoming: StatsRecord,
  meta: Pick<BulkPuzzleMeta, 'maxScore' | 'wordCount' | 'pangramCount'> | null,
): StatsRecord {
  const maxScore = meta ? meta.maxScore : incoming.max_score;
  const cappedScore = Math.min(incoming.best_score, maxScore);
  const sanitizedIncoming: StatsRecord = {
    ...incoming,
    max_score: maxScore,
    best_score: cappedScore,
    best_rank: rankForScore(cappedScore, maxScore),
    words_found: meta ? Math.min(incoming.words_found, meta.wordCount) : incoming.words_found,
    pangrams_found: meta
      ? Math.min(incoming.pangrams_found ?? 0, meta.pangramCount)
      : (incoming.pangrams_found ?? 0),
    best_no_hint_score:
      incoming.best_no_hint_score !== undefined
        ? Math.min(incoming.best_no_hint_score, cappedScore)
        : undefined,
  };

  const mergedBase = existing ? mergeStatsRecord(existing, sanitizedIncoming) : sanitizedIncoming;
  const mergedMaxScore = meta
    ? meta.maxScore
    : existing
      ? Math.max(existing.max_score, sanitizedIncoming.max_score)
      : sanitizedIncoming.max_score;
  const mergedScore = Math.min(mergedBase.best_score, mergedMaxScore);

  return {
    ...mergedBase,
    max_score: mergedMaxScore,
    best_score: mergedScore,
    best_rank: rankForScore(mergedScore, mergedMaxScore),
    long_words_count: Math.max(
      Number(existing?.long_words_count ?? 0),
      mergedBase.long_words_count ?? 0,
    ),
    is_daily: Boolean(existing?.is_daily || mergedBase.is_daily),
    played_at_date: mergedBase.played_at_date ?? existing?.played_at_date,
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Pre-resolve sanitization metadata for all unique referenced puzzle slots outside a write
 * transaction using 2 parallel queries (`puzzles WHERE slot IN (...)` + `blocked_words`),
 * without polluting the 10-entry `_puzzleCache`.
 */
export async function preloadBulkPuzzleMeta(
  db: Kysely<Database>,
  stats: PlayerStats | undefined,
  puzzleStates: SyncPuzzleState[] | undefined,
): Promise<Map<number, BulkPuzzleMeta>> {
  const uniqueSlotSet = new Set<number>();
  for (const record of stats?.records ?? []) {
    uniqueSlotSet.add(record.puzzle_number);
  }
  for (const state of puzzleStates ?? []) {
    uniqueSlotSet.add(state.puzzle_number);
  }

  const metaMap = new Map<number, BulkPuzzleMeta>();
  const uniqueSlots = Array.from(uniqueSlotSet);
  if (uniqueSlots.length === 0) {
    return metaMap;
  }

  const slotChunks = chunkArray(uniqueSlots, SLOT_IN_QUERY_CHUNK_SIZE);
  const [puzzleRowChunks, blockedWords] = await Promise.all([
    Promise.all(
      slotChunks.map((slots) =>
        db
          .selectFrom('puzzles')
          .select(['slot', 'letters', 'center', 'max_score'])
          .where('slot', 'in', slots)
          .where('is_active', '=', 1)
          .execute(),
      ),
    ),
    getBlockedWords(db),
  ]);

  for (const rows of puzzleRowChunks) {
    for (const row of rows) {
      const centerNormalized = row.center.trim().toLowerCase();
      const allLetters = new Set(
        row.letters
          .split(',')
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean),
      );
      allLetters.add(centerNormalized);
      const computed = computePuzzle(row.letters, row.center, blockedWords);
      metaMap.set(Number(row.slot), {
        allLetters,
        validWords: new Set(computed.words),
        maxScore: computed.max_score,
        wordCount: computed.words.length,
        pangramCount: computed.hint_data.pangram_count,
      });
    }
  }

  return metaMap;
}

/**
 * Bulk upsert client stats and puzzle states when pairing a device via `/auth/transfer/use`
 * using bounded bulk reads and chunked multi-row UPSERT statements.
 */
export async function bulkUpsertLocalData(
  db: Kysely<Database>,
  playerId: number,
  stats: PlayerStats | undefined,
  puzzleStates: SyncPuzzleState[] | undefined,
  preloadedPuzzles?: Map<number, BulkPuzzleMeta>,
): Promise<void> {
  const statRecords = stats?.records ?? [];
  const states = puzzleStates ?? [];
  if (statRecords.length === 0 && states.length === 0) {
    return;
  }

  const puzzleMetaMap = preloadedPuzzles ?? (await preloadBulkPuzzleMeta(db, stats, puzzleStates));

  if (statRecords.length > 0) {
    const existingRows = await db
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
      .execute();

    const statsMap = new Map<number, StatsRecord>();
    for (const row of existingRows) {
      const puzzleNumber = Number(row.puzzle_number);
      statsMap.set(puzzleNumber, {
        puzzle_number: puzzleNumber,
        date: row.date,
        best_rank: row.best_rank,
        best_score: Number(row.best_score),
        max_score: Number(row.max_score),
        words_found: Number(row.words_found),
        hints_used: Number(row.hints_used),
        elapsed_ms: Number(row.elapsed_ms),
        longest_word: row.longest_word ?? undefined,
        pangrams_found: Number(row.pangrams_found),
        best_no_hint_score: Number(row.best_no_hint_score),
        long_words_count: Number(row.long_words_count ?? 0),
        is_daily: Boolean(row.is_daily),
        played_at_date: row.played_at_date ?? undefined,
      });
    }

    const dirtySlots = new Set<number>();
    for (const incoming of statRecords) {
      const merged = sanitizeAndMergeStatsRecord(
        statsMap.get(incoming.puzzle_number),
        incoming,
        puzzleMetaMap.get(incoming.puzzle_number) ?? null,
      );
      statsMap.set(incoming.puzzle_number, merged);
      dirtySlots.add(incoming.puzzle_number);
    }

    const valuesToUpsert = Array.from(dirtySlots).map((slot) => {
      const merged = statsMap.get(slot)!;
      return {
        player_id: playerId,
        puzzle_number: merged.puzzle_number,
        date: merged.date,
        best_rank: merged.best_rank,
        best_score: merged.best_score,
        max_score: merged.max_score,
        words_found: merged.words_found,
        hints_used: merged.hints_used,
        elapsed_ms: merged.elapsed_ms,
        longest_word:
          merged.longest_word && merged.longest_word.length > 0 ? merged.longest_word : null,
        pangrams_found: merged.pangrams_found ?? 0,
        best_no_hint_score: bestNoHintScoreForRecord(merged),
        long_words_count: merged.long_words_count ?? 0,
        is_daily: merged.is_daily ? 1 : 0,
        played_at_date: merged.played_at_date ?? null,
      };
    });

    for (const chunk of chunkArray(valuesToUpsert, STATS_UPSERT_CHUNK_SIZE)) {
      await db
        .insertInto('player_stats')
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(['player_id', 'puzzle_number']).doUpdateSet((eb) => ({
            date: eb.ref('excluded.date'),
            best_rank: eb.ref('excluded.best_rank'),
            best_score: eb.ref('excluded.best_score'),
            max_score: eb.ref('excluded.max_score'),
            words_found: eb.ref('excluded.words_found'),
            hints_used: eb.ref('excluded.hints_used'),
            elapsed_ms: eb.ref('excluded.elapsed_ms'),
            longest_word: eb.ref('excluded.longest_word'),
            pangrams_found: eb.ref('excluded.pangrams_found'),
            best_no_hint_score: eb.ref('excluded.best_no_hint_score'),
            long_words_count: eb.ref('excluded.long_words_count'),
            is_daily: eb.ref('excluded.is_daily'),
            played_at_date: eb.ref('excluded.played_at_date'),
            updated_at: sql<string>`datetime('now')`,
          })),
        )
        .execute();
    }
  }

  if (states.length > 0) {
    const existingRows = await db
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

    const stateMap = new Map<number, SyncPuzzleState>();
    for (const row of existingRows) {
      const puzzleNumber = Number(row.puzzle_number);
      stateMap.set(puzzleNumber, {
        puzzle_number: puzzleNumber,
        found_words: JSON.parse(row.found_words) as string[],
        score: Number(row.score),
        hints_unlocked: JSON.parse(row.hints_unlocked) as string[],
        started_at: Number(row.started_at),
        total_paused_ms: Number(row.total_paused_ms),
        score_before_hints: row.score_before_hints !== null ? Number(row.score_before_hints) : null,
      });
    }

    const dirtySlots = new Set<number>();
    for (const incoming of states) {
      const merged = sanitizeAndMergePuzzleState(
        stateMap.get(incoming.puzzle_number),
        incoming,
        puzzleMetaMap.get(incoming.puzzle_number) ?? null,
      );
      stateMap.set(incoming.puzzle_number, merged);
      dirtySlots.add(incoming.puzzle_number);
    }

    const valuesToUpsert = Array.from(dirtySlots).map((slot) => {
      const merged = stateMap.get(slot)!;
      return {
        player_id: playerId,
        puzzle_number: merged.puzzle_number,
        found_words: JSON.stringify(merged.found_words),
        score: merged.score,
        hints_unlocked: JSON.stringify(merged.hints_unlocked),
        started_at: merged.started_at,
        total_paused_ms: merged.total_paused_ms,
        score_before_hints: merged.score_before_hints ?? null,
      };
    });

    for (const chunk of chunkArray(valuesToUpsert, STATE_UPSERT_CHUNK_SIZE)) {
      await db
        .insertInto('player_puzzle_states')
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(['player_id', 'puzzle_number']).doUpdateSet((eb) => ({
            found_words: eb.ref('excluded.found_words'),
            score: eb.ref('excluded.score'),
            hints_unlocked: eb.ref('excluded.hints_unlocked'),
            started_at: eb.ref('excluded.started_at'),
            total_paused_ms: eb.ref('excluded.total_paused_ms'),
            score_before_hints: eb.ref('excluded.score_before_hints'),
            updated_at: sql<string>`datetime('now')`,
          })),
        )
        .execute();
    }
  }
}
