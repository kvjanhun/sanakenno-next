import { rankForScore, STATS_STORAGE_KEY, type PlayerStats } from '@sanakenno/shared';
import { isPuzzleRevealed, loadFromStorage, readSavedPuzzleState } from '../gameplay/storage.js';

export interface ArchivePlayStatus {
  played: boolean;
  rank: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  wordsFound: number;
  hintsUsed: boolean;
  isTopRank: boolean;
  isFullBoard: boolean;
  isRevealed: boolean;
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

export function getArchivePlayStatus(puzzleNumber: number, maxScore: number): ArchivePlayStatus {
  const isRevealed = isPuzzleRevealed(puzzleNumber);
  const state = readSavedPuzzleState(puzzleNumber);

  if (state && Array.isArray(state.foundWords) && state.foundWords.length > 0) {
    const score = state.score;
    const rank = rankForScore(score, maxScore);
    const percentage = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
    const hintsUsed = (state.hintsUnlocked?.length ?? 0) > 0;
    const isTopRank = percentage >= 70;
    const isFullBoard = maxScore > 0 && score >= maxScore;

    return {
      played: true,
      rank,
      score,
      maxScore,
      percentage,
      wordsFound: state.foundWords.length,
      hintsUsed,
      isTopRank,
      isFullBoard,
      isRevealed,
    };
  }

  const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY);
  const record = stats?.records.find((r) => r.puzzle_number === puzzleNumber);
  if (record && record.words_found > 0) {
    const score = record.best_score;
    const rank = record.best_rank || rankForScore(score, maxScore);
    const percentage = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
    const hintsUsed = record.hints_used > 0;
    const isTopRank = percentage >= 70;
    const isFullBoard = maxScore > 0 && score >= maxScore;

    return {
      played: true,
      rank,
      score,
      maxScore,
      percentage,
      wordsFound: record.words_found,
      hintsUsed,
      isTopRank,
      isFullBoard,
      isRevealed,
    };
  }

  return {
    played: false,
    rank: null,
    score: 0,
    maxScore,
    percentage: 0,
    wordsFound: 0,
    hintsUsed: false,
    isTopRank: false,
    isFullBoard: false,
    isRevealed,
  };
}
