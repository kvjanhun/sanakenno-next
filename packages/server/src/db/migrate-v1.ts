import fs from 'node:fs';
import path from 'node:path';
import SQLite from 'better-sqlite3';
import {
  BASELINE_SQL,
  backfillPlayerStatsInDb,
  recomputePuzzleMaxScores,
  runMigrations,
  type BackfillStatsSummary,
} from './baseline-sql.js';

export interface MigrateV1DbResult extends BackfillStatsSummary {
  sourcePath: string;
  outputPath: string;
  totalPuzzles: number;
  activePuzzles: number;
  puzzlesRecomputed: number;
  blockedWordsCount: number;
  playersCount: number;
  playerStatsCount: number;
  playerPuzzleStatesCount: number;
  integrityCheck: string;
}

/**
 * Safely copy a Sanakenno 1.0 SQLite database to `outputPath`, apply all 2.0
 * schema migrations, seed curated blocked words, recompute `puzzles.max_score`,
 * backfill `player_stats` (`is_daily`, `played_at_date`, `long_words_count`),
 * checkpoint WAL into a single portable SQLite file, and verify integrity.
 *
 * Never mutates `sourcePath`.
 */
export function migrateV1DatabaseFile(
  sourcePath: string,
  outputPath = `${sourcePath.replace(/\.db$/, '')}-v2.db`,
): MigrateV1DbResult {
  const resolvedSource = path.resolve(sourcePath);
  const resolvedOutput = path.resolve(outputPath);

  if (resolvedSource === resolvedOutput) {
    throw new Error('outputPath must be different from sourcePath to avoid mutating the source DB');
  }
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source database file does not exist: ${resolvedSource}`);
  }

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(resolvedOutput + suffix)) {
      fs.unlinkSync(resolvedOutput + suffix);
    }
  }

  // Use SQLite VACUUM INTO from a read-only connection so any active WAL frames
  // adjacent to sourcePath are cleanly consolidated without touching sourcePath.
  const sourceDb = new SQLite(resolvedSource, { readonly: true });
  try {
    const escapedOut = resolvedOutput.replaceAll("'", "''");
    sourceDb.exec(`VACUUM INTO '${escapedOut}'`);
  } finally {
    sourceDb.close();
  }

  const targetDb = new SQLite(resolvedOutput);
  try {
    targetDb.pragma('journal_mode = WAL');
    targetDb.pragma('foreign_keys = ON');
    targetDb.pragma('busy_timeout = 5000');

    // Count rows needing backfill before migrations run
    let preBackfillNullPlayedAt = 0;
    const hasPlayerStats = targetDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player_stats'")
      .get();
    if (hasPlayerStats) {
      const cols = targetDb.prepare('PRAGMA table_info(player_stats)').all() as Array<{
        name: string;
      }>;
      if (!cols.some((c) => c.name === 'played_at_date')) {
        const cntRow = targetDb.prepare('SELECT COUNT(*) AS cnt FROM player_stats').get() as {
          cnt: number;
        };
        preBackfillNullPlayedAt = Number(cntRow.cnt);
      } else {
        const cntRow = targetDb
          .prepare('SELECT COUNT(*) AS cnt FROM player_stats WHERE played_at_date IS NULL')
          .get() as { cnt: number };
        preBackfillNullPlayedAt = Number(cntRow.cnt);
      }
    }

    targetDb.exec(BASELINE_SQL);
    runMigrations(targetDb);

    // Ensure idempotent full backfill even if some migrations were already recorded
    let puzzlesRecomputed = 0;
    let statsSummary: BackfillStatsSummary = {
      statsBackfilled: 0,
      dailyStatsCount: 0,
      longWordsBackfilledCount: 0,
    };

    targetDb.exec('BEGIN IMMEDIATE');
    try {
      puzzlesRecomputed = recomputePuzzleMaxScores(targetDb, false);
      statsSummary = backfillPlayerStatsInDb(targetDb);
      targetDb.exec('COMMIT');
    } catch (err) {
      targetDb.exec('ROLLBACK');
      throw err;
    }

    const totalStatsBackfilled = Math.max(preBackfillNullPlayedAt, statsSummary.statsBackfilled);

    // Consolidate WAL frames and switch to DELETE journal mode so the output
    // is a standalone single file ready for GCS `seed.db` upload.
    targetDb.pragma('wal_checkpoint(TRUNCATE)');
    targetDb.pragma('journal_mode = DELETE');

    const integrityRow = targetDb.prepare('PRAGMA integrity_check').get() as
      { integrity_check: string } | undefined;
    const integrityCheck = integrityRow?.integrity_check ?? 'unknown';
    if (integrityCheck !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${integrityCheck}`);
    }

    const countTable = (table: string, where = ''): number => {
      const row = targetDb.prepare(`SELECT COUNT(*) AS cnt FROM ${table} ${where}`).get() as {
        cnt: number;
      };
      return Number(row.cnt);
    };

    return {
      sourcePath: resolvedSource,
      outputPath: resolvedOutput,
      totalPuzzles: countTable('puzzles'),
      activePuzzles: countTable('puzzles', 'WHERE is_active = 1'),
      puzzlesRecomputed,
      blockedWordsCount: countTable('blocked_words'),
      playersCount: countTable('players'),
      playerStatsCount: countTable('player_stats'),
      playerPuzzleStatesCount: countTable('player_puzzle_states'),
      statsBackfilled: totalStatsBackfilled,
      dailyStatsCount: statsSummary.dailyStatsCount,
      longWordsBackfilledCount: statsSummary.longWordsBackfilledCount,
      integrityCheck,
    };
  } finally {
    targetDb.close();
  }
}
