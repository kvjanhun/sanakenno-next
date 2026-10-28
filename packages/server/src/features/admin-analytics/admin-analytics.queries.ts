import { RANK_NAMES } from '@sanakenno/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';

export interface AchievementStatRow {
  rank: string;
  achieved_at: string;
  session_id: string | null;
}

export interface FailedGuessStatRow {
  puzzle_date: string;
  word: string;
  count: number;
}

export interface WordFindStatRow {
  word: string;
  count: number;
}

const RANK_INDEX = new Map<string, number>(RANK_NAMES.map((name, i) => [name, i]));

export async function getAchievementRows(
  db: Kysely<Database>,
  days: number,
): Promise<AchievementStatRow[]> {
  const cutoff = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  const rows = await db
    .selectFrom('achievements')
    .select(['rank', 'achieved_at', 'session_id'])
    .where('achieved_at', '>=', cutoff)
    .orderBy('achieved_at', 'desc')
    .execute();

  return rows.map((r) => ({
    rank: r.rank,
    achieved_at: r.achieved_at,
    session_id: r.session_id,
  }));
}

export function groupAchievementsByDay(
  rows: AchievementStatRow[],
  mode: 'users' | 'all',
  days: number,
) {
  const dailyMap = new Map<string, Record<string, number>>();
  const totals: Record<string, number> = {};
  for (const rank of RANK_NAMES) totals[rank] = 0;

  if (mode === 'users') {
    const sessionBestDaily = new Map<string, { date: string; rankIdx: number }>();
    const sessionBestOverall = new Map<string, number>();

    for (const row of rows) {
      if (!row.session_id) continue;
      const isoStr = row.achieved_at.includes('T')
        ? row.achieved_at
        : row.achieved_at.replace(' ', 'T') + 'Z';
      const utcDate = new Date(isoStr);
      const dateStr = utcDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });
      const key = `${dateStr}:${row.session_id}`;
      const idx = RANK_INDEX.get(row.rank) ?? 0;

      const existingDaily = sessionBestDaily.get(key);
      if (!existingDaily || idx > existingDaily.rankIdx) {
        sessionBestDaily.set(key, { date: dateStr, rankIdx: idx });
      }

      const existingOverall = sessionBestOverall.get(row.session_id);
      if (existingOverall === undefined || idx > existingOverall) {
        sessionBestOverall.set(row.session_id, idx);
      }
    }

    for (const { date, rankIdx } of sessionBestDaily.values()) {
      if (!dailyMap.has(date)) {
        dailyMap.set(date, Object.fromEntries(RANK_NAMES.map((r) => [r, 0])));
      }
      const rankName = RANK_NAMES[rankIdx]!;
      dailyMap.get(date)![rankName]!++;
    }

    for (const rankIdx of sessionBestOverall.values()) {
      const rankName = RANK_NAMES[rankIdx]!;
      totals[rankName]!++;
    }
  } else {
    for (const row of rows) {
      const isoStr = row.achieved_at.includes('T')
        ? row.achieved_at
        : row.achieved_at.replace(' ', 'T') + 'Z';
      const utcDate = new Date(isoStr);
      const dateStr = utcDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, Object.fromEntries(RANK_NAMES.map((r) => [r, 0])));
      }
      const dayCounts = dailyMap.get(dateStr)!;
      if (dayCounts[row.rank] !== undefined) dayCounts[row.rank]!++;
      if (totals[row.rank] !== undefined) totals[row.rank]!++;
    }
  }

  const todayHki = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });
  const anchor = new Date(todayHki + 'T12:00:00Z');

  const daily: Array<{
    date: string;
    counts: Record<string, number>;
    total: number;
  }> = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(anchor.getTime() - d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    const counts = dailyMap.get(dateStr) ?? Object.fromEntries(RANK_NAMES.map((r) => [r, 0]));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    daily.push({ date: dateStr, counts, total });
  }

  return { days, daily, totals, mode };
}

export async function getFailedGuessRows(
  db: Kysely<Database>,
  days: number,
): Promise<FailedGuessStatRow[]> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .selectFrom('failed_guesses')
    .select(['puzzle_date', 'word', 'count'])
    .where('puzzle_date', '>=', cutoff)
    .orderBy('puzzle_date', 'desc')
    .orderBy('count', 'desc')
    .orderBy('word', 'asc')
    .execute();

  return rows.map((r) => ({
    puzzle_date: r.puzzle_date,
    word: r.word,
    count: Number(r.count),
  }));
}

export function groupFailedGuessesByDay(rows: FailedGuessStatRow[], days: number) {
  const totalsByDay = new Map<string, number>();
  const wordsByDay = new Map<string, Array<{ word: string; count: number }>>();

  for (const row of rows) {
    totalsByDay.set(row.puzzle_date, (totalsByDay.get(row.puzzle_date) ?? 0) + row.count);

    if (!wordsByDay.has(row.puzzle_date)) {
      wordsByDay.set(row.puzzle_date, []);
    }

    const words = wordsByDay.get(row.puzzle_date)!;
    if (words.length < 50) {
      words.push({ word: row.word, count: row.count });
    }
  }

  const todayHki = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });
  const anchor = new Date(todayHki + 'T12:00:00Z');

  const daily: Array<{
    date: string;
    total_count: number;
    words: Array<{ word: string; count: number }>;
  }> = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(anchor.getTime() - d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    daily.push({
      date: dateStr,
      total_count: totalsByDay.get(dateStr) ?? 0,
      words: wordsByDay.get(dateStr) ?? [],
    });
  }

  const grandTotal = daily.reduce((sum, day) => sum + day.total_count, 0);
  return { days, daily, grand_total: grandTotal };
}

export async function getWordFindRows(
  db: Kysely<Database>,
  puzzleNumber: number,
): Promise<WordFindStatRow[]> {
  const rows = await db
    .selectFrom('word_finds')
    .select(['word', 'count'])
    .where('puzzle_number', '=', puzzleNumber)
    .orderBy('count', 'asc')
    .orderBy('word', 'asc')
    .execute();

  return rows.map((r) => ({
    word: r.word,
    count: Number(r.count),
  }));
}
