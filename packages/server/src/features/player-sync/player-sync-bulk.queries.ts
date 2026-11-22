import {
  bestNoHintScoreForRecord,
  deriveStatsRecordFromState,
  isDailyRecord,
  mergeIsDaily,
  mergePuzzleState,
  mergeStatsRecord,
  rankForScore,
  recalcScore,
  type CanonicalPuzzleState,
  type PlayerStats,
  type PuzzleMetaForStats,
  type StatsRecord,
  type SyncPuzzleState,
} from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getBlockedWords } from '../puzzle/puzzle.queries.js';
import { computePuzzle, parseComputedPuzzleData, type FullPuzzleData } from '../puzzle/wordlist.js';

const STATE_UPSERT_CHUNK_SIZE = 40;
const SLOT_IN_QUERY_CHUNK_SIZE = 500;

/**
 * Safely parse a JSON string column into a string array, falling back to `[]` on corrupt data.
 */
export function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

/**
 * Safely parse a JSON string column into a `StatsRecord`, or null if absent/invalid.
 */
export function parseFrozenStats(raw: string | null | undefined): StatsRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StatsRecord;
  } catch {
    return null;
  }
}

export interface BulkPuzzleMeta extends PuzzleMetaForStats {
  validWords: Set<string>;
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

  const mergedRaw = existing
    ? mergePuzzleState(existing, sanitizedIncoming)
    : { ...sanitizedIncoming, revealed: Boolean(sanitizedIncoming.revealed) };
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
    revealed: Boolean(mergedRaw.revealed),
  };
}

function sanitizeIncomingStatsRecord(
  existing: StatsRecord | undefined,
  incoming: StatsRecord,
  meta: Pick<BulkPuzzleMeta, 'maxScore' | 'wordCount' | 'pangramCount'> | null,
): StatsRecord {
  const maxScore = meta ? meta.maxScore : incoming.max_score;
  const cappedScore = Math.min(incoming.best_score, maxScore);
  const sanitized: StatsRecord = {
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

  const mergedBase = existing ? mergeStatsRecord(existing, sanitized) : sanitized;
  const mergedMaxScore = meta
    ? meta.maxScore
    : existing
      ? Math.max(existing.max_score, sanitized.max_score)
      : sanitized.max_score;
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
    is_daily: existing ? mergeIsDaily(existing, sanitized) : isDailyRecord(sanitized),
    played_at_date: mergedBase.played_at_date ?? existing?.played_at_date,
    best_no_hint_score: Math.min(bestNoHintScoreForRecord(mergedBase), mergedScore),
  };
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Pre-resolve sanitization metadata for all unique referenced puzzle slots directly from
 * `puzzles.computed_data`, only querying `blocked_words` + running `computePuzzle` for
 * legacy rows with `computed_data = NULL`.
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
  const puzzleRowChunks = await Promise.all(
    slotChunks.map((slots) =>
      db
        .selectFrom('puzzles')
        .select(['slot', 'letters', 'center', 'max_score', 'computed_data'])
        .where('slot', 'in', slots)
        .where('is_active', '=', 1)
        .execute(),
    ),
  );

  let blockedWords: string[] | null = null;
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
      let computed = parseComputedPuzzleData(row.computed_data);
      if (!computed) {
        if (blockedWords === null) {
          blockedWords = await getBlockedWords(db);
        }
        computed = computePuzzle(row.letters, row.center, blockedWords);
      }
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
 * Bulk upsert client stats and puzzle states into the single canonical `player_puzzle_states` table
 * when pairing a device via `/auth/transfer/use`.
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
      'revealed',
      'date',
      'max_score',
      'is_daily',
      'played_at_date',
      'elapsed_ms',
      'frozen_stats_json',
    ])
    .where('player_id', '=', playerId)
    .execute();

  const canonicalMap = new Map<number, CanonicalPuzzleState>();
  for (const row of existingRows) {
    const puzzleNumber = Number(row.puzzle_number);
    canonicalMap.set(puzzleNumber, {
      puzzle_number: puzzleNumber,
      found_words: parseStringArray(row.found_words),
      score: Number(row.score),
      hints_unlocked: parseStringArray(row.hints_unlocked),
      started_at: Number(row.started_at),
      total_paused_ms: Number(row.total_paused_ms),
      score_before_hints: row.score_before_hints !== null ? Number(row.score_before_hints) : null,
      revealed: Boolean(row.revealed),
      date: row.date,
      max_score: Number(row.max_score),
      is_daily: Boolean(row.is_daily),
      played_at_date: row.played_at_date,
      elapsed_ms: Number(row.elapsed_ms),
      frozen_stats: parseFrozenStats(row.frozen_stats_json),
    });
  }

  const incomingStatesBySlot = new Map<number, SyncPuzzleState>();
  for (const st of states) {
    incomingStatesBySlot.set(st.puzzle_number, st);
  }
  const incomingStatsBySlot = new Map<number, StatsRecord>();
  for (const rec of statRecords) {
    incomingStatsBySlot.set(rec.puzzle_number, rec);
  }

  const dirtySlots = new Set<number>([
    ...incomingStatesBySlot.keys(),
    ...incomingStatsBySlot.keys(),
  ]);

  for (const slot of dirtySlots) {
    const meta = puzzleMetaMap.get(slot) ?? null;
    const existing = canonicalMap.get(slot);
    const incomingState = incomingStatesBySlot.get(slot);
    const incomingStat = incomingStatsBySlot.get(slot);

    const wasRevealed = Boolean(existing?.revealed);
    const mergedState: SyncPuzzleState = incomingState
      ? sanitizeAndMergePuzzleState(existing, incomingState, meta)
      : (existing ?? {
          puzzle_number: slot,
          found_words: [],
          score: 0,
          hints_unlocked: [],
          started_at: 0,
          total_paused_ms: 0,
          score_before_hints: null,
          revealed: false,
        });

    const isNowRevealed = Boolean(mergedState.revealed);
    let frozenStats = existing?.frozen_stats ?? null;
    let date = existing?.date ?? null;
    let maxScore = meta ? meta.maxScore : (existing?.max_score ?? 0);
    let isDaily = Boolean(existing?.is_daily);
    let playedAtDate = existing?.played_at_date ?? null;
    let elapsedMs = existing?.elapsed_ms ?? 0;

    if (!wasRevealed && isNowRevealed) {
      const existingDerived = existing ? deriveStatsRecordFromState(existing, meta) : null;
      if (incomingStat && incomingStat.words_found > 0) {
        const mergedFrozen = sanitizeIncomingStatsRecord(
          existingDerived ?? undefined,
          incomingStat,
          meta,
        );
        frozenStats = mergedFrozen;
        date = date || mergedFrozen.date;
        maxScore = meta ? meta.maxScore : Math.max(maxScore, mergedFrozen.max_score);
        isDaily = Boolean(mergedFrozen.is_daily);
        playedAtDate = mergedFrozen.played_at_date ?? playedAtDate;
        elapsedMs = Math.max(elapsedMs, mergedFrozen.elapsed_ms);
      } else {
        frozenStats = existingDerived;
      }
    } else if (!isNowRevealed && incomingStat) {
      const baseExistingStats = existing
        ? (deriveStatsRecordFromState(existing, meta) ?? undefined)
        : undefined;
      const sanitizedStat = sanitizeIncomingStatsRecord(baseExistingStats, incomingStat, meta);
      date = date || sanitizedStat.date;
      maxScore = meta ? meta.maxScore : Math.max(maxScore, sanitizedStat.max_score);
      isDaily = Boolean(sanitizedStat.is_daily);
      playedAtDate = sanitizedStat.played_at_date ?? playedAtDate;
      elapsedMs = Math.max(elapsedMs, sanitizedStat.elapsed_ms);

      const candidateState: CanonicalPuzzleState = {
        ...mergedState,
        date,
        max_score: maxScore,
        is_daily: isDaily,
        played_at_date: playedAtDate,
        elapsed_ms: elapsedMs,
        frozen_stats: null,
      };
      const derivedOnly = deriveStatsRecordFromState(candidateState, meta);
      const needsFrozen =
        !derivedOnly ||
        sanitizedStat.best_score > derivedOnly.best_score ||
        sanitizedStat.words_found > derivedOnly.words_found ||
        (sanitizedStat.pangrams_found ?? 0) > (derivedOnly.pangrams_found ?? 0) ||
        (sanitizedStat.long_words_count ?? 0) > (derivedOnly.long_words_count ?? 0) ||
        bestNoHintScoreForRecord(sanitizedStat) > bestNoHintScoreForRecord(derivedOnly) ||
        (sanitizedStat.longest_word ?? '').length > (derivedOnly.longest_word ?? '').length ||
        frozenStats !== null;

      if (needsFrozen) {
        frozenStats = frozenStats ? mergeStatsRecord(frozenStats, sanitizedStat) : sanitizedStat;
      }
    }

    canonicalMap.set(slot, {
      ...mergedState,
      revealed: isNowRevealed,
      date,
      max_score: maxScore,
      is_daily: isDaily,
      played_at_date: playedAtDate,
      elapsed_ms: elapsedMs,
      frozen_stats: frozenStats,
    });
  }

  const valuesToUpsert = Array.from(dirtySlots).map((slot) => {
    const merged = canonicalMap.get(slot)!;
    return {
      player_id: playerId,
      puzzle_number: merged.puzzle_number,
      found_words: JSON.stringify(merged.found_words),
      score: merged.score,
      hints_unlocked: JSON.stringify(merged.hints_unlocked),
      started_at: merged.started_at,
      total_paused_ms: merged.total_paused_ms,
      score_before_hints: merged.score_before_hints ?? null,
      revealed: merged.revealed ? 1 : 0,
      date: merged.date ?? null,
      max_score: merged.max_score ?? 0,
      is_daily: merged.is_daily ? 1 : 0,
      played_at_date: merged.played_at_date ?? null,
      elapsed_ms: merged.elapsed_ms ?? 0,
      frozen_stats_json: merged.frozen_stats ? JSON.stringify(merged.frozen_stats) : null,
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
          revealed: eb.ref('excluded.revealed'),
          date: eb.ref('excluded.date'),
          max_score: eb.ref('excluded.max_score'),
          is_daily: eb.ref('excluded.is_daily'),
          played_at_date: eb.ref('excluded.played_at_date'),
          elapsed_ms: eb.ref('excluded.elapsed_ms'),
          frozen_stats_json: eb.ref('excluded.frozen_stats_json'),
          updated_at: sql<string>`datetime('now')`,
        })),
      )
      .execute();
  }
}
