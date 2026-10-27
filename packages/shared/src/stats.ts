/**
 * Player statistics computation — pure functions.
 */

import { NO_HINT_ACHIEVEMENTS, RANKS } from './scoring.js';

export interface StatsRecord {
  puzzle_number: number;
  date: string;
  best_rank: string;
  best_score: number;
  max_score: number;
  words_found: number;
  hints_used: number;
  elapsed_ms: number;
  longest_word?: string;
  pangrams_found?: number;
  best_no_hint_score?: number;
}

export interface PlayerStats {
  records: StatsRecord[];
  version: 1;
}

export const STATS_STORAGE_KEY = 'sanakenno_player_stats';

export interface LifetimeStats {
  totalWords: number;
  totalPangrams: number;
  longestWord: string;
}

export interface LifetimeNoHintStats {
  highestPercentage: number;
  topTierCount: number;
}

/** Return a stable YYYY-MM-DD calendar date in Helsinki time. */
export function getHelsinkiDateString(date: Date = new Date()): string {
  const helsinkiParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = helsinkiParts.find((p) => p.type === 'year')?.value;
  const month = helsinkiParts.find((p) => p.type === 'month')?.value;
  const day = helsinkiParts.find((p) => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/** Map a Finnish rank name to its numeric index (higher = better). */
export function rankIndex(name: string): number {
  const idx = RANKS.findIndex((r) => r.name === name);
  if (idx === -1) return -1;
  return RANKS.length - 1 - idx;
}

function longerWord(a: string | undefined, b: string | undefined): string {
  const wa = a ?? '';
  const wb = b ?? '';
  return wa.length >= wb.length ? wa : wb;
}

/** Return the best known no-hint score, backfilling old no-hint records. */
export function bestNoHintScoreForRecord(record: StatsRecord): number {
  if (typeof record.best_no_hint_score === 'number' && record.best_no_hint_score > 0) {
    return Math.max(0, record.best_no_hint_score);
  }
  return record.hints_used === 0 ? Math.max(0, record.best_score) : 0;
}

/**
 * Upsert a stats record. Only upgrades best_rank and best_score.
 * Returns a new PlayerStats (immutable).
 */
export function updateStatsRecord(stats: PlayerStats, record: StatsRecord): PlayerStats {
  const existing = stats.records.find((r) => r.puzzle_number === record.puzzle_number);

  if (!existing) {
    return {
      ...stats,
      records: [
        ...stats.records,
        {
          ...record,
          best_no_hint_score: bestNoHintScoreForRecord(record),
        },
      ],
    };
  }

  const shouldUpgrade = rankIndex(record.best_rank) > rankIndex(existing.best_rank);

  return {
    ...stats,
    records: stats.records.map((r) =>
      r.puzzle_number === record.puzzle_number
        ? {
            ...r,
            best_rank: shouldUpgrade ? record.best_rank : r.best_rank,
            best_score: Math.max(r.best_score, record.best_score),
            words_found: Math.max(r.words_found, record.words_found),
            hints_used: Math.max(r.hints_used, record.hints_used),
            elapsed_ms: Math.max(r.elapsed_ms, record.elapsed_ms),
            longest_word: longerWord(r.longest_word, record.longest_word),
            pangrams_found: Math.max(r.pangrams_found ?? 0, record.pangrams_found ?? 0),
            best_no_hint_score: Math.max(
              bestNoHintScoreForRecord(r),
              bestNoHintScoreForRecord(record),
            ),
          }
        : r,
    ),
  };
}

/**
 * Compute current and best streak from a list of date strings.
 * Dates must be ISO format (YYYY-MM-DD).
 */
export function computeStreak(
  records: StatsRecord[],
  today?: string,
): { current: number; best: number } {
  if (records.length === 0) return { current: 0, best: 0 };

  const dates = [...new Set(records.map((r) => r.date))].sort().reverse();
  const latestDateStr = dates[0];
  if (!latestDateStr) return { current: 0, best: 0 };

  const todayStr = today ?? getHelsinkiDateString();
  const todayDate = new Date(todayStr + 'T12:00:00');
  const latestDate = new Date(latestDateStr + 'T12:00:00');
  const daysDiff = Math.round((todayDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

  let current = 0;
  if (daysDiff <= 1) {
    current = 1;
    for (let i = 1; i < dates.length; i++) {
      const prevStr = dates[i - 1];
      const currStr = dates[i];
      if (!prevStr || !currStr) break;
      const prev = new Date(prevStr + 'T12:00:00');
      const curr = new Date(currStr + 'T12:00:00');
      const diff = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  const sorted = [...dates].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prevStr = sorted[i - 1];
    const currStr = sorted[i];
    if (!prevStr || !currStr) continue;
    const prev = new Date(prevStr + 'T12:00:00');
    const curr = new Date(currStr + 'T12:00:00');
    const diff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  best = Math.max(best, current);

  return { current, best };
}

/** Compute lifetime totals shown in stats views. */
export function computeLifetimeStats(records: StatsRecord[]): LifetimeStats {
  return records.reduce<LifetimeStats>(
    (totals, record) => {
      const word = record.longest_word ?? '';
      return {
        totalWords: totals.totalWords + record.words_found,
        totalPangrams: totals.totalPangrams + (record.pangrams_found ?? 0),
        longestWord: word.length > totals.longestWord.length ? word : totals.longestWord,
      };
    },
    { totalWords: 0, totalPangrams: 0, longestWord: '' },
  );
}

/** Compute lifetime no-hint achievement totals shown in stats views. */
export function computeLifetimeNoHintStats(records: StatsRecord[]): LifetimeNoHintStats {
  const topTierPct = NO_HINT_ACHIEVEMENTS[NO_HINT_ACHIEVEMENTS.length - 1]?.pct ?? 70;

  return records.reduce<LifetimeNoHintStats>(
    (totals, record) => {
      const percentage =
        record.max_score > 0 ? (bestNoHintScoreForRecord(record) / record.max_score) * 100 : 0;
      return {
        highestPercentage: Math.max(totals.highestPercentage, percentage),
        topTierCount: percentage >= topTierPct ? totals.topTierCount + 1 : totals.topTierCount,
      };
    },
    { highestPercentage: 0, topTierCount: 0 },
  );
}

/** Count best rank occurrences across all puzzle records. */
export function computeRankDistribution(records: StatsRecord[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const r of records) {
    dist[r.best_rank] = (dist[r.best_rank] || 0) + 1;
  }
  return dist;
}

/** Average completion percentage across all puzzle records. */
export function computeAverageCompletion(records: StatsRecord[]): number {
  if (records.length === 0) return 0;
  const total = records.reduce((sum, r) => {
    return sum + (r.max_score > 0 ? (r.best_score / r.max_score) * 100 : 0);
  }, 0);
  return total / records.length;
}

/** Create an empty PlayerStats object. */
export function emptyStats(): PlayerStats {
  return { records: [], version: 1 };
}
