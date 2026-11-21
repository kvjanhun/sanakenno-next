/**
 * Player statistics computation — pure functions.
 */

import { NO_HINT_MILESTONES, RANKS } from './scoring.js';

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
  is_daily?: boolean;
  played_at_date?: string;
  long_words_count?: number;
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

export function isDailyRecord(record: StatsRecord): boolean {
  if (record.is_daily !== undefined) {
    return record.is_daily;
  }
  if (record.played_at_date) {
    return record.played_at_date === record.date;
  }
  return true;
}

/**
 * Resolve `is_daily` asymmetrically when merging an existing record with an incoming update.
 * Preserves legacy `is_daily: undefined` daily records while ensuring partial sync updates
 * (`{ is_daily: undefined, played_at_date: undefined }`) never promote an explicit archive
 * record (`existing.is_daily === false`) to `true`.
 */
export function mergeIsDaily(existing: StatsRecord, incoming: StatsRecord): boolean {
  if (existing.is_daily === true || incoming.is_daily === true) return true;
  if (existing.is_daily === undefined && isDailyRecord(existing)) return true;
  if (incoming.is_daily === undefined && incoming.played_at_date !== undefined) {
    return incoming.played_at_date === incoming.date;
  }
  return false;
}

/**
 * Shared monotonic field-by-field merge for two stats records of the same puzzle_number.
 */
export function mergeStatsRecordFields(existing: StatsRecord, incoming: StatsRecord): StatsRecord {
  const shouldUpgrade = rankIndex(incoming.best_rank) > rankIndex(existing.best_rank);

  return {
    puzzle_number: existing.puzzle_number,
    date: existing.date,
    best_rank: shouldUpgrade ? incoming.best_rank : existing.best_rank,
    best_score: Math.max(existing.best_score, incoming.best_score),
    max_score: Math.max(existing.max_score, incoming.max_score),
    words_found: Math.max(existing.words_found, incoming.words_found),
    hints_used: Math.max(existing.hints_used, incoming.hints_used),
    elapsed_ms: Math.max(existing.elapsed_ms, incoming.elapsed_ms),
    longest_word: longerWord(existing.longest_word, incoming.longest_word),
    pangrams_found: Math.max(existing.pangrams_found ?? 0, incoming.pangrams_found ?? 0),
    best_no_hint_score: Math.max(
      bestNoHintScoreForRecord(existing),
      bestNoHintScoreForRecord(incoming),
    ),
    is_daily: mergeIsDaily(existing, incoming),
    played_at_date: incoming.played_at_date ?? existing.played_at_date,
    long_words_count: Math.max(existing.long_words_count ?? 0, incoming.long_words_count ?? 0),
  };
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

  return {
    ...stats,
    records: stats.records.map((r) =>
      r.puzzle_number === record.puzzle_number ? mergeStatsRecordFields(r, record) : r,
    ),
  };
}

function parseIsoDateUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

/**
 * Compute current and best streak from a list of date strings.
 * Dates must be ISO format (YYYY-MM-DD).
 */
export function computeStreak(
  records: StatsRecord[],
  today?: string,
): { current: number; best: number } {
  const dailyRecords = records.filter((r) => isDailyRecord(r) && r.words_found > 0);
  if (dailyRecords.length === 0) return { current: 0, best: 0 };

  const dates = [...new Set(dailyRecords.map((r) => r.date))].sort().reverse();
  const latestDateStr = dates[0];
  if (!latestDateStr) return { current: 0, best: 0 };

  const todayStr = today ?? getHelsinkiDateString();
  const daysDiff = Math.round(
    (parseIsoDateUtc(todayStr) - parseIsoDateUtc(latestDateStr)) / 86_400_000,
  );

  let current = 0;
  if (daysDiff >= 0 && daysDiff <= 1) {
    current = 1;
    for (let i = 1; i < dates.length; i++) {
      const prevStr = dates[i - 1];
      const currStr = dates[i];
      if (!prevStr || !currStr) break;
      const diff = Math.round((parseIsoDateUtc(prevStr) - parseIsoDateUtc(currStr)) / 86_400_000);
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
    const diff = Math.round((parseIsoDateUtc(currStr) - parseIsoDateUtc(prevStr)) / 86_400_000);
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

/** Compute lifetime no-hint milestone totals shown in stats views. */
export function computeLifetimeNoHintStats(records: StatsRecord[]): LifetimeNoHintStats {
  const topTierPct = NO_HINT_MILESTONES[NO_HINT_MILESTONES.length - 1]?.pct ?? 70;

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
