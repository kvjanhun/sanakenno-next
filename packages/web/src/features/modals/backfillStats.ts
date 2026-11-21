import { bestNoHintScoreForRecord, STATS_STORAGE_KEY, type PlayerStats } from '@sanakenno/shared';
import {
  isPuzzleRevealed,
  readSavedPuzzleState,
  saveToStorage,
  type PersistedPuzzleState,
} from '../gameplay/storage.js';

function noHintScoreFromState(state: PersistedPuzzleState | null): number {
  if (!state) return 0;
  if (typeof state.scoreBeforeHints === 'number') return state.scoreBeforeHints;
  if ((state.hintsUnlocked ?? []).length === 0 && typeof state.score === 'number') {
    return state.score;
  }
  return 0;
}

function longWordsCountFromState(state: PersistedPuzzleState | null): number {
  if (!state || !Array.isArray(state.foundWords)) return 0;
  return state.foundWords.filter((w) => w.length >= 10).length;
}

function longestWordFromState(state: PersistedPuzzleState | null): string | undefined {
  if (!state || !Array.isArray(state.foundWords)) return undefined;
  return state.foundWords.reduce((longest, w) => (w.length > longest.length ? w : longest), '');
}

export function savedNoHintScore(puzzleNumber: number): number {
  return noHintScoreFromState(readSavedPuzzleState(puzzleNumber));
}

export function savedLongWordsCount(puzzleNumber: number): number {
  return longWordsCountFromState(readSavedPuzzleState(puzzleNumber));
}

export function savedLongestWord(puzzleNumber: number): string | undefined {
  return longestWordFromState(readSavedPuzzleState(puzzleNumber));
}

/** Backfill best no-hint score, long words count, and longest word from saved puzzle state on existing records. */
export function backfillNoHintStats(stats: PlayerStats): PlayerStats {
  let changed = false;
  const updatedRecords = stats.records.map((record) => {
    if (isPuzzleRevealed(record.puzzle_number)) {
      return record;
    }

    const saved = readSavedPuzzleState(record.puzzle_number);
    const noHint = Math.max(bestNoHintScoreForRecord(record), noHintScoreFromState(saved));
    const longWords = Math.max(record.long_words_count ?? 0, longWordsCountFromState(saved));
    const longestFromSaved = longestWordFromState(saved);
    const longest =
      (longestFromSaved?.length ?? 0) > (record.longest_word?.length ?? 0)
        ? longestFromSaved
        : record.longest_word;

    if (
      noHint !== record.best_no_hint_score ||
      longWords !== (record.long_words_count ?? 0) ||
      longest !== record.longest_word
    ) {
      changed = true;
    }

    return {
      ...record,
      best_no_hint_score: noHint,
      long_words_count: longWords,
      longest_word: longest,
    };
  });

  const result: PlayerStats = {
    ...stats,
    records: updatedRecords,
    version: 1,
  };

  if (changed) {
    saveToStorage(STATS_STORAGE_KEY, result);
  }

  return result;
}
