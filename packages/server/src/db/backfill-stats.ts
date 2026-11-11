import { getHelsinkiDateString } from '@sanakenno/shared';
import type BetterSqlite3 from 'better-sqlite3';

export interface BackfillStatsSummary {
  statsBackfilled: number;
  dailyStatsCount: number;
  longWordsBackfilledCount: number;
}

function hasTable(db: BetterSqlite3.Database, table: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table) !==
    undefined
  );
}

/**
 * Backfill historical player_stats rows with is_daily, played_at_date, and long_words_count.
 */
export function backfillPlayerStatsInDb(db: BetterSqlite3.Database): BackfillStatsSummary {
  if (!hasTable(db, 'player_stats')) {
    return { statsBackfilled: 0, dailyStatsCount: 0, longWordsBackfilledCount: 0 };
  }

  const stateMap = new Map<string, { foundWords: string[]; startedAt: number }>();
  if (hasTable(db, 'player_puzzle_states')) {
    const stateRows = db
      .prepare('SELECT player_id, puzzle_number, found_words, started_at FROM player_puzzle_states')
      .all() as Array<{
      player_id: number;
      puzzle_number: number;
      found_words: string;
      started_at: number;
    }>;
    for (const st of stateRows) {
      let parsedWords: string[] = [];
      try {
        const raw = JSON.parse(st.found_words) as unknown;
        if (Array.isArray(raw)) {
          parsedWords = raw.filter((w): w is string => typeof w === 'string');
        }
      } catch {
        parsedWords = [];
      }
      stateMap.set(`${st.player_id}:${st.puzzle_number}`, {
        foundWords: parsedWords,
        startedAt: Number(st.started_at ?? 0),
      });
    }
  }

  const statRows = db
    .prepare(
      'SELECT id, player_id, puzzle_number, date, updated_at, is_daily, played_at_date, long_words_count FROM player_stats',
    )
    .all() as Array<{
    id: number;
    player_id: number;
    puzzle_number: number;
    date: string;
    updated_at: string | null;
    is_daily: number | null;
    played_at_date: string | null;
    long_words_count: number | null;
  }>;

  const updateStmt = db.prepare(
    'UPDATE player_stats SET is_daily = ?, played_at_date = ?, long_words_count = ? WHERE id = ?',
  );

  let statsBackfilled = 0;
  let dailyStatsCount = 0;
  let longWordsBackfilledCount = 0;

  for (const row of statRows) {
    const state = stateMap.get(`${row.player_id}:${row.puzzle_number}`);
    const computedLongWords = state ? state.foundWords.filter((w) => w.length >= 10).length : 0;
    const nextLongWords = Math.max(Number(row.long_words_count ?? 0), computedLongWords);

    const updatedAtDate =
      typeof row.updated_at === 'string' && row.updated_at.length >= 10
        ? row.updated_at.slice(0, 10)
        : '';
    const startedAtDate =
      state && state.startedAt > 0 ? getHelsinkiDateString(new Date(state.startedAt)) : '';

    let nextIsDaily = Number(row.is_daily ?? 0);
    let nextPlayedAtDate = row.played_at_date;

    if (row.played_at_date === null) {
      const wasDaily = updatedAtDate === row.date || startedAtDate === row.date;
      nextIsDaily = wasDaily || nextIsDaily === 1 ? 1 : 0;
      nextPlayedAtDate = wasDaily ? row.date : updatedAtDate || startedAtDate || row.date;
    }

    if (
      nextIsDaily !== Number(row.is_daily ?? 0) ||
      nextPlayedAtDate !== row.played_at_date ||
      nextLongWords !== Number(row.long_words_count ?? 0)
    ) {
      updateStmt.run(nextIsDaily, nextPlayedAtDate, nextLongWords, row.id);
      statsBackfilled += 1;
    }
    if (nextIsDaily === 1) dailyStatsCount += 1;
    if (nextLongWords > 0) longWordsBackfilledCount += 1;
  }

  return { statsBackfilled, dailyStatsCount, longWordsBackfilledCount };
}
