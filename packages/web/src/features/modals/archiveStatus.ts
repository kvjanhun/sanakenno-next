import { rankForScore, STATS_STORAGE_KEY, type PlayerStats } from '@sanakenno/shared';
import { isPuzzleRevealed, loadFromStorage, readSavedPuzzleState } from '../gameplay/storage.js';

export interface ArchivePlayStatus {
  played: boolean;
  rank: string | null;
  wordsFound: number;
  isFullBoard: boolean;
  isRevealed: boolean;
}

/** Load persisted player stats once so calendar grids can reuse them across all days. */
export function loadArchivePlayerStats(): PlayerStats | null {
  return loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
}

/** Format a YYYY-MM-DD date string as Finnish short date (e.g. "ma 31.3."). */
export function formatFinnishDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

/** Format year and 0-indexed month as Finnish month name and year (e.g. "Maaliskuu 2026"). */
export function formatFinnishMonth(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
  const monthName = d.toLocaleDateString('fi-FI', { month: 'long', timeZone: 'UTC' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
}

export function getArchivePlayStatus(
  puzzleNumber: number,
  maxScore: number,
  preloadedStats?: PlayerStats | null,
): ArchivePlayStatus {
  const isRevealed = isPuzzleRevealed(puzzleNumber);
  const state = readSavedPuzzleState(puzzleNumber);

  if (state && Array.isArray(state.foundWords) && state.foundWords.length > 0) {
    const score = state.score;
    const rank = rankForScore(score, maxScore);
    const isFullBoard = maxScore > 0 && score >= maxScore;

    return {
      played: true,
      rank,
      wordsFound: state.foundWords.length,
      isFullBoard,
      isRevealed,
    };
  }

  const stats = preloadedStats !== undefined ? preloadedStats : loadArchivePlayerStats();
  const record = stats?.records.find((r) => r.puzzle_number === puzzleNumber);
  if (record && record.words_found > 0) {
    const score = record.best_score;
    const rank = record.best_rank || rankForScore(score, maxScore);
    const isFullBoard = maxScore > 0 && score >= maxScore;

    return {
      played: true,
      rank,
      wordsFound: record.words_found,
      isFullBoard,
      isRevealed,
    };
  }

  return {
    played: false,
    rank: null,
    wordsFound: 0,
    isFullBoard: false,
    isRevealed,
  };
}
