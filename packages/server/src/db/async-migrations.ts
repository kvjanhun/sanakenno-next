import type { StatsRecord } from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import { BASELINE_STATEMENTS, CURATED_BLOCKED_WORDS } from './baseline-sql.js';
import { runImmediateTransactionWithRetry } from './retry.js';
import type { Database } from './schema.js';

interface LegacyPlayerStatRow {
  player_id: number;
  puzzle_number: number;
  date: string;
  best_rank: string;
  best_score: number;
  max_score: number;
  words_found: number;
  hints_used: number;
  elapsed_ms: number;
  longest_word: string | null;
  pangrams_found: number;
  best_no_hint_score: number;
  long_words_count?: number;
  is_daily?: number;
  played_at_date?: string | null;
}

async function consolidateLegacyPlayerStatsAsync(db: Kysely<Database>): Promise<void> {
  if (!(await hasTableAsync(db, 'player_stats'))) return;

  const statRowsResult = await sql<LegacyPlayerStatRow>`
    SELECT player_id, puzzle_number, date, best_rank, best_score, max_score,
           words_found, hints_used, elapsed_ms, longest_word, pangrams_found,
           best_no_hint_score, long_words_count, is_daily, played_at_date
    FROM player_stats
  `.execute(db);

  const existingStates = await db
    .selectFrom('player_puzzle_states')
    .select([
      'player_id',
      'puzzle_number',
      'found_words',
      'score',
      'hints_unlocked',
      'score_before_hints',
      'revealed',
    ])
    .execute();

  const stateMap = new Map(
    existingStates.map((row) => [`${Number(row.player_id)}:${Number(row.puzzle_number)}`, row]),
  );

  for (const r of statRowsResult.rows) {
    const playerId = Number(r.player_id);
    const puzzleNumber = Number(r.puzzle_number);
    const statRecord: StatsRecord = {
      puzzle_number: puzzleNumber,
      date: r.date,
      best_rank: r.best_rank,
      best_score: Number(r.best_score),
      max_score: Number(r.max_score),
      words_found: Number(r.words_found),
      hints_used: Number(r.hints_used),
      elapsed_ms: Number(r.elapsed_ms),
      longest_word: r.longest_word ?? undefined,
      pangrams_found: Number(r.pangrams_found),
      best_no_hint_score: Number(r.best_no_hint_score),
      long_words_count: Number(r.long_words_count ?? 0),
      is_daily: Boolean(r.is_daily),
      played_at_date: r.played_at_date ?? undefined,
    };

    const existing = stateMap.get(`${playerId}:${puzzleNumber}`);
    if (existing) {
      let foundCount = 0;
      let hintsCount = 0;
      try {
        const fw = JSON.parse(existing.found_words) as unknown;
        if (Array.isArray(fw)) foundCount = fw.length;
        const hu = JSON.parse(existing.hints_unlocked) as unknown;
        if (Array.isArray(hu)) hintsCount = hu.length;
      } catch {
        // fallback to frozen snapshot
      }
      const stateScore = Number(existing.score);
      const stateNoHint = hintsCount === 0 ? stateScore : Number(existing.score_before_hints ?? 0);
      const needsFrozen =
        Boolean(existing.revealed) ||
        foundCount === 0 ||
        statRecord.best_score > stateScore ||
        statRecord.words_found > foundCount ||
        (statRecord.best_no_hint_score ?? 0) > stateNoHint;

      await db
        .updateTable('player_puzzle_states')
        .set({
          date: statRecord.date,
          max_score: statRecord.max_score,
          is_daily: statRecord.is_daily ? 1 : 0,
          played_at_date: statRecord.played_at_date ?? null,
          elapsed_ms: statRecord.elapsed_ms,
          frozen_stats_json: needsFrozen ? JSON.stringify(statRecord) : null,
        })
        .where('player_id', '=', playerId)
        .where('puzzle_number', '=', puzzleNumber)
        .execute();
    } else {
      await db
        .insertInto('player_puzzle_states')
        .values({
          player_id: playerId,
          puzzle_number: puzzleNumber,
          found_words: '[]',
          score: statRecord.best_score,
          hints_unlocked: '[]',
          started_at: 0,
          total_paused_ms: 0,
          score_before_hints: null,
          revealed: 0,
          date: statRecord.date,
          max_score: statRecord.max_score,
          is_daily: statRecord.is_daily ? 1 : 0,
          played_at_date: statRecord.played_at_date ?? null,
          elapsed_ms: statRecord.elapsed_ms,
          frozen_stats_json: JSON.stringify(statRecord),
        })
        .execute();
    }
  }

  await sql`DROP TABLE IF EXISTS player_stats`.execute(db);
}

interface AsyncMigration {
  version: string;
  description: string;
  up: (db: Kysely<Database>) => Promise<void>;
}

async function hasTableAsync(db: Kysely<Database>, table: string): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}
  `.execute(db);
  return result.rows.length > 0;
}

export async function ensureColumnAsync(
  db: Kysely<Database>,
  table: string,
  column: string,
  decl: string,
): Promise<void> {
  if (!(await hasTableAsync(db, table))) return;
  const info = await sql<{ name: string }>`PRAGMA table_info(${sql.raw(table)})`.execute(db);
  if (info.rows.some((row) => row.name === column)) return;
  await sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN ${sql.raw(column)} ${sql.raw(decl)}`.execute(
    db,
  );
}

async function seedCuratedBlockedWordsAsync(db: Kysely<Database>): Promise<void> {
  if (!(await hasTableAsync(db, 'blocked_words'))) return;
  if (CURATED_BLOCKED_WORDS.length === 0) return;

  await db
    .insertInto('blocked_words')
    .values(CURATED_BLOCKED_WORDS.map((word) => ({ word })))
    .onConflict((oc) => oc.column('word').doNothing())
    .execute();
}

export const ASYNC_MIGRATIONS: readonly AsyncMigration[] = [
  {
    version: '0001-baseline',
    description: 'Adopt baseline schema columns',
    async up(db) {
      await ensureColumnAsync(db, 'players', 'preferences', 'TEXT');
      await ensureColumnAsync(db, 'puzzles', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
      await ensureColumnAsync(
        db,
        'player_stats',
        'best_no_hint_score',
        'INTEGER NOT NULL DEFAULT 0',
      );
    },
  },
  {
    version: '0002-add-puzzle-max-score',
    description: 'Ensure max_score column exists on puzzles',
    async up(db) {
      await ensureColumnAsync(db, 'puzzles', 'max_score', 'INTEGER');
    },
  },
  {
    version: '0003-seed-curated-blocked-words',
    description: 'Seed curated slurs, hate speech, and explicit violence into blocked_words',
    async up(db) {
      await seedCuratedBlockedWordsAsync(db);
    },
  },
  {
    version: '0004-add-player-stats-long-words-and-streak-integrity',
    description: 'Ensure long_words_count, is_daily, and played_at_date exist on player_stats',
    async up(db) {
      await ensureColumnAsync(db, 'player_stats', 'long_words_count', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumnAsync(db, 'player_stats', 'is_daily', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumnAsync(db, 'player_stats', 'played_at_date', 'TEXT DEFAULT NULL');
    },
  },
  {
    version: '0005-add-player-transfer-tickets',
    description: 'Ensure player_transfer_tickets table exists for 15-minute pairing tickets',
    async up(db) {
      await sql`
        CREATE TABLE IF NOT EXISTS player_transfer_tickets (
          id         TEXT PRIMARY KEY,
          player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          code       TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at    TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS idx_transfer_tickets_code ON player_transfer_tickets(code)`.execute(
        db,
      );
      await sql`CREATE INDEX IF NOT EXISTS idx_transfer_tickets_expires ON player_transfer_tickets(expires_at)`.execute(
        db,
      );
    },
  },
  {
    version: '0006-add-player-puzzle-state-revealed',
    description: 'Add revealed flag to player_puzzle_states for monotonic answer-reveal sync',
    async up(db) {
      await ensureColumnAsync(db, 'player_puzzle_states', 'revealed', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: '0007-cleanup-legacy-schema',
    description: 'Drop unused page_views table and normalize legacy config.rotation_epoch key',
    async up(db) {
      await sql`DROP TABLE IF EXISTS page_views`.execute(db);
      await sql`DROP TABLE IF EXISTS player_transfer_tokens`.execute(db);
      if (await hasTableAsync(db, 'config')) {
        await sql`
          INSERT OR IGNORE INTO config (key, value)
          SELECT 'epoch_date', value FROM config WHERE key = 'rotation_epoch'
        `.execute(db);
        await sql`DELETE FROM config WHERE key = 'rotation_epoch'`.execute(db);
      }
    },
  },
  {
    version: '0008-add-puzzle-computed-data',
    description: 'Add computed_data JSON column to puzzles for precomputed puzzle payloads',
    async up(db) {
      await ensureColumnAsync(db, 'puzzles', 'computed_data', 'TEXT DEFAULT NULL');
    },
  },
  {
    version: '0009-consolidate-player-stats-into-puzzle-states',
    description:
      'Consolidate player_stats metadata and frozen/orphan snapshots into player_puzzle_states and drop player_stats',
    async up(db) {
      await ensureColumnAsync(db, 'player_puzzle_states', 'date', 'TEXT DEFAULT NULL');
      await ensureColumnAsync(
        db,
        'player_puzzle_states',
        'max_score',
        'INTEGER NOT NULL DEFAULT 0',
      );
      await ensureColumnAsync(db, 'player_puzzle_states', 'is_daily', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumnAsync(db, 'player_puzzle_states', 'played_at_date', 'TEXT DEFAULT NULL');
      await ensureColumnAsync(
        db,
        'player_puzzle_states',
        'elapsed_ms',
        'INTEGER NOT NULL DEFAULT 0',
      );
      await ensureColumnAsync(db, 'player_puzzle_states', 'frozen_stats_json', 'TEXT DEFAULT NULL');
      await consolidateLegacyPlayerStatsAsync(db);
    },
  },
];

/**
 * Apply baseline DDL and pending migrations asynchronously over Kysely.
 * Executes a single `schema_migrations` read fast-path on already-migrated databases.
 */
export async function runMigrationsAsync(db: Kysely<Database>): Promise<boolean> {
  const expectedVersions = ASYNC_MIGRATIONS.map((migration) => migration.version);

  try {
    const existing = await db.selectFrom('schema_migrations').select('version').execute();
    const appliedSet = new Set(existing.map((row) => row.version));
    if (expectedVersions.every((version) => appliedSet.has(version))) {
      return false;
    }
  } catch {
    // Fresh database without schema_migrations table yet
  }

  for (const statement of BASELINE_STATEMENTS) {
    await sql.raw(statement).execute(db);
  }

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `.execute(db);

  const appliedRows = await db.selectFrom('schema_migrations').select('version').execute();
  const applied = new Set(appliedRows.map((row) => row.version));

  let appliedAny = false;
  for (const migration of ASYNC_MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    const didApply = await runImmediateTransactionWithRetry(db, async (trx) => {
      const check = await trx
        .selectFrom('schema_migrations')
        .select('version')
        .where('version', '=', migration.version)
        .executeTakeFirst();
      if (check) return false;

      await migration.up(trx);
      await trx.insertInto('schema_migrations').values({ version: migration.version }).execute();
      return true;
    });

    if (didApply) {
      appliedAny = true;
    }
  }

  return appliedAny;
}
