import {
  bestNoHintScoreForRecord,
  getHelsinkiDateString,
  STATS_STORAGE_KEY,
  type PlayerStats,
} from '@sanakenno/shared';
import {
  loadFromStorage,
  puzzleStateKey,
  readSavedPuzzleState,
  saveToStorage,
} from '../gameplay/storage.js';

interface StoredPuzzleState {
  score?: number;
  hintsUnlocked?: string[];
  scoreBeforeHints?: number | null;
}

export function savedNoHintScore(puzzleNumber: number): number {
  const state = loadFromStorage<StoredPuzzleState>(puzzleStateKey(puzzleNumber));
  if (!state) return 0;
  if (typeof state.scoreBeforeHints === 'number') return state.scoreBeforeHints;
  if ((state.hintsUnlocked ?? []).length === 0 && typeof state.score === 'number') {
    return state.score;
  }
  return 0;
}

export function savedLongWordsCount(puzzleNumber: number): number {
  const state = readSavedPuzzleState(puzzleNumber);
  if (!state || !Array.isArray(state.foundWords)) return 0;
  return state.foundWords.filter((w) => w.length >= 10).length;
}

export function savedLongestWord(puzzleNumber: number): string | undefined {
  const state = readSavedPuzzleState(puzzleNumber);
  if (!state || !Array.isArray(state.foundWords)) return undefined;
  return state.foundWords.reduce((longest, w) => (w.length > longest.length ? w : longest), '');
}

/** Backfill best no-hint score, long words count, and longest word from saved puzzle state. */
export function backfillNoHintStats(stats: PlayerStats): PlayerStats {
  let changed = false;
  const updatedRecords = stats.records.map((record) => {
    const noHint = Math.max(
      bestNoHintScoreForRecord(record),
      savedNoHintScore(record.puzzle_number),
    );
    const longWords = Math.max(
      record.long_words_count ?? 0,
      savedLongWordsCount(record.puzzle_number),
    );
    const longestFromSaved = savedLongestWord(record.puzzle_number);
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

  // Also check if any saved puzzle in localStorage was omitted from records
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith('sanakenno_state_')) continue;
        const num = parseInt(key.replace('sanakenno_state_', ''), 10);
        if (Number.isNaN(num) || updatedRecords.some((r) => r.puzzle_number === num)) continue;
        const saved = readSavedPuzzleState(num);
        if (saved && Array.isArray(saved.foundWords) && saved.foundWords.length > 0) {
          const longWords = saved.foundWords.filter((w) => w.length >= 10).length;
          const longest = saved.foundWords.reduce(
            (longest, w) => (w.length > longest.length ? w : longest),
            '',
          );
          updatedRecords.push({
            puzzle_number: num,
            date: getHelsinkiDateString(),
            best_rank: 'Onnistuja',
            best_score: saved.score ?? 0,
            max_score: 100,
            words_found: saved.foundWords.length,
            hints_used: (saved.hintsUnlocked ?? []).length,
            elapsed_ms: Math.max(0, saved.startedAt ? Date.now() - saved.startedAt : 0),
            longest_word: longest,
            pangrams_found: 0,
            best_no_hint_score:
              saved.scoreBeforeHints ?? (saved.hintsUnlocked?.length === 0 ? saved.score : 0),
            long_words_count: longWords,
          });
          changed = true;
        }
      }
    } catch {
      // Storage access may fail in non-standard test runners
    }
  }

  const result = {
    ...stats,
    records: updatedRecords,
  };

  if (changed) {
    saveToStorage(STATS_STORAGE_KEY, result);
  }

  return result;
}
