/**
 * Client-side and server-side merge functions for cross-device sync.
 *
 * Merge strategy: take the best of both sides. No data is ever discarded.
 */

import { isPangram, rankForScore, recalcScore } from './scoring.js';
import {
  bestNoHintScoreForRecord,
  getHelsinkiDateString,
  mergeStatsRecordFields,
  rankIndex,
  type StatsRecord,
} from './stats.js';
import type { SyncPuzzleState } from './auth-types.js';

export interface PuzzleMetaForStats {
  allLetters: Set<string>;
  maxScore: number;
  wordCount?: number;
  pangramCount?: number;
}

export interface CanonicalPuzzleState extends SyncPuzzleState {
  date?: string | null;
  max_score?: number;
  is_daily?: boolean;
  played_at_date?: string | null;
  elapsed_ms?: number;
  frozen_stats?: StatsRecord | null;
}

/**
 * Deterministically derive a `StatsRecord` from a canonical `player_puzzle_states` row
 * and optional puzzle metadata.
 * - Revealed puzzles return only their pre-reveal `frozen_stats` snapshot (or `null` if revealed at 0 words).
 * - Unrevealed 0-word puzzles return `frozen_stats` if present (historical orphan record), else `null`.
 */
export function deriveStatsRecordFromState(
  state: CanonicalPuzzleState,
  puzzleMeta: PuzzleMetaForStats | null,
): StatsRecord | null {
  if (state.revealed) {
    return state.frozen_stats ?? null;
  }

  if (state.found_words.length === 0) {
    return state.frozen_stats ?? null;
  }

  const score = puzzleMeta ? recalcScore(state.found_words, puzzleMeta.allLetters) : state.score;
  const maxScore = puzzleMeta ? puzzleMeta.maxScore : Math.max(state.max_score ?? 0, score);
  const longestWord = state.found_words.reduce(
    (longest, word) => (word.length > longest.length ? word : longest),
    '',
  );
  const pangramsFound = puzzleMeta
    ? state.found_words.filter((word) => isPangram(word, puzzleMeta.allLetters)).length
    : 0;
  const longWordsCount = state.found_words.filter((word) => word.length >= 10).length;
  const bestNoHintScore =
    state.hints_unlocked.length === 0 ? score : Math.min(state.score_before_hints ?? 0, score);
  const fallbackDate =
    state.started_at > 0
      ? getHelsinkiDateString(new Date(state.started_at))
      : getHelsinkiDateString();
  const date = state.date && state.date.length > 0 ? state.date : fallbackDate;

  const derived: StatsRecord = {
    puzzle_number: state.puzzle_number,
    date,
    best_rank: rankForScore(score, maxScore),
    best_score: score,
    max_score: maxScore,
    words_found: state.found_words.length,
    hints_used: state.hints_unlocked.length,
    elapsed_ms: Math.max(0, state.elapsed_ms ?? 0),
    longest_word: longestWord.length > 0 ? longestWord : undefined,
    pangrams_found: pangramsFound,
    best_no_hint_score: bestNoHintScore,
    long_words_count: longWordsCount,
    is_daily: Boolean(state.is_daily),
    played_at_date: state.played_at_date ?? undefined,
  };

  if (!state.frozen_stats) {
    return derived;
  }

  const merged = mergeStatsRecordFields(state.frozen_stats, derived);
  const cappedScore = Math.min(merged.best_score, maxScore);
  return {
    ...merged,
    max_score: maxScore,
    best_score: cappedScore,
    best_rank: rankForScore(cappedScore, maxScore),
    words_found:
      puzzleMeta?.wordCount !== undefined
        ? Math.min(merged.words_found, puzzleMeta.wordCount)
        : merged.words_found,
    pangrams_found:
      puzzleMeta?.pangramCount !== undefined
        ? Math.min(merged.pangrams_found ?? 0, puzzleMeta.pangramCount)
        : (merged.pangrams_found ?? 0),
    best_no_hint_score: Math.min(bestNoHintScoreForRecord(merged), cappedScore),
  };
}

function hasAdditionalItems(local: string[], server: string[]): boolean {
  const serverSet = new Set(server);
  return local.some((item) => !serverSet.has(item));
}

function earlierStartedAt(a: number, b: number): number {
  if (a > 0 && b > 0) return Math.min(a, b);
  return a || b;
}

/**
 * Merge two stats records for the same puzzle_number.
 */
export function mergeStatsRecord(existing: StatsRecord, incoming: StatsRecord): StatsRecord {
  return mergeStatsRecordFields(existing, incoming);
}

/**
 * Merge two puzzle states for the same puzzle_number.
 */
export function mergePuzzleState(local: SyncPuzzleState, server: SyncPuzzleState): SyncPuzzleState {
  const foundWordsSet = new Set([...local.found_words, ...server.found_words]);
  const hintsSet = new Set([...local.hints_unlocked, ...server.hints_unlocked]);

  let scoreBeforeHints: number | null = null;
  if (hintsSet.size > 0) {
    const localScore = local.hints_unlocked.length > 0 ? local.score_before_hints : null;
    const serverScore = server.hints_unlocked.length > 0 ? server.score_before_hints : null;
    if (localScore !== null && serverScore !== null) {
      scoreBeforeHints = Math.max(localScore, serverScore);
    } else {
      scoreBeforeHints = localScore ?? serverScore;
    }
  }

  return {
    puzzle_number: local.puzzle_number,
    found_words: [...foundWordsSet],
    score: Math.max(local.score, server.score),
    hints_unlocked: [...hintsSet],
    started_at: earlierStartedAt(local.started_at, server.started_at),
    total_paused_ms: Math.max(local.total_paused_ms, server.total_paused_ms),
    score_before_hints: scoreBeforeHints,
    revealed: Boolean(local.revealed || server.revealed),
  };
}

/**
 * Return true when a local stats record contains strictly better progress than
 * the server record and should be pushed back after a pull/merge.
 */
export function isStatsRecordBetterThanServer(
  local: StatsRecord,
  server: StatsRecord | undefined,
): boolean {
  if (!server) return true;
  if (rankIndex(local.best_rank) > rankIndex(server.best_rank)) return true;
  if (local.best_score > server.best_score) return true;
  if (local.max_score > server.max_score) return true;
  if (local.words_found > server.words_found) return true;
  if (local.hints_used > server.hints_used) return true;
  if (local.elapsed_ms > server.elapsed_ms) return true;
  if ((local.longest_word ?? '').length > (server.longest_word ?? '').length) {
    return true;
  }
  if ((local.pangrams_found ?? 0) > (server.pangrams_found ?? 0)) return true;
  if (local.is_daily && !server.is_daily) return true;
  if ((local.long_words_count ?? 0) > (server.long_words_count ?? 0)) return true;
  return bestNoHintScoreForRecord(local) > bestNoHintScoreForRecord(server);
}

/**
 * Return true when a local puzzle state contains progress not yet represented
 * by the server state and should be pushed back after a pull/merge.
 */
export function isPuzzleStateBetterThanServer(
  local: SyncPuzzleState,
  server: SyncPuzzleState | undefined,
): boolean {
  if (!server) return true;
  if (hasAdditionalItems(local.found_words, server.found_words)) return true;
  if (hasAdditionalItems(local.hints_unlocked, server.hints_unlocked)) {
    return true;
  }
  if (local.score > server.score) return true;
  if (local.started_at > 0 && (server.started_at === 0 || local.started_at < server.started_at)) {
    return true;
  }
  if (local.total_paused_ms > server.total_paused_ms) return true;
  const localScoreBeforeHints = local.hints_unlocked.length > 0 ? local.score_before_hints : null;
  const serverScoreBeforeHints =
    server.hints_unlocked.length > 0 ? server.score_before_hints : null;
  if (localScoreBeforeHints !== null) {
    if (serverScoreBeforeHints === null) return true;
    if (localScoreBeforeHints > serverScoreBeforeHints) return true;
  }
  if (Boolean(local.revealed) && !server.revealed) return true;
  return false;
}
