import { getHelsinkiDateString } from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import { computePuzzle } from '../features/puzzle/wordlist.js';
import { BASELINE_SQL, CURATED_BLOCKED_WORDS } from './baseline-sql.js';
import { runImmediateTransactionWithRetry } from './retry.js';
import type { Database } from './schema.js';

interface AsyncMigration {
  version: string;
  description: string;
  up: (db: Kysely<Database>) => Promise<void>;
}

function splitSqlStatements(script: string): string[] {
  return script
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

async function hasTableAsync(db: Kysely<Database>, table: string): Promise<boolean> {
  const result = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}
  `.execute(db);
  return result.rows.length > 0;
}

async function ensureColumnAsync(
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

async function recomputePuzzleMaxScoresAsync(
  db: Kysely<Database>,
  onlyNull = false,
): Promise<number> {
  if (!(await hasTableAsync(db, 'puzzles'))) return 0;
  await seedCuratedBlockedWordsAsync(db);

  let query = db.selectFrom('puzzles').select(['slot', 'letters', 'center']);
  if (onlyNull) {
    query = query.where('max_score', 'is', null);
  }
  const rows = await query.execute();
  if (rows.length === 0) return 0;

  let blockedWords: string[] = [];
  if (await hasTableAsync(db, 'blocked_words')) {
    try {
      const blockedRows = await db.selectFrom('blocked_words').select('word').execute();
      blockedWords = blockedRows.map((row) => row.word);
    } catch {
      blockedWords = [];
    }
  }

  let updated = 0;
  for (const row of rows) {
    try {
      const data = computePuzzle(row.letters, row.center, blockedWords);
      if (data && typeof data.max_score === 'number') {
        await db
          .updateTable('puzzles')
          .set({ max_score: data.max_score })
          .where('slot', '=', row.slot)
          .execute();
        updated += 1;
      }
    } catch {
      // Opportunistic query backfill handles missing wordlist environments
    }
  }
  return updated;
}

async function backfillPlayerStatsAsync(db: Kysely<Database>): Promise<void> {
  if (!(await hasTableAsync(db, 'player_stats'))) return;

  const stateMap = new Map<string, { foundWords: string[]; startedAt: number }>();
  if (await hasTableAsync(db, 'player_puzzle_states')) {
    const stateRows = await db
      .selectFrom('player_puzzle_states')
      .select(['player_id', 'puzzle_number', 'found_words', 'started_at'])
      .execute();
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

  const statRows = await db
    .selectFrom('player_stats')
    .select([
      'id',
      'player_id',
      'puzzle_number',
      'date',
      'updated_at',
      'is_daily',
      'played_at_date',
      'long_words_count',
    ])
    .execute();

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
    let nextPlayedAtDate = row.played_at_date ?? null;

    if (nextPlayedAtDate === null) {
      const wasDaily = updatedAtDate === row.date || startedAtDate === row.date;
      nextIsDaily = wasDaily || nextIsDaily === 1 ? 1 : 0;
      nextPlayedAtDate = wasDaily ? row.date : updatedAtDate || startedAtDate || row.date;
    }

    if (
      nextIsDaily !== Number(row.is_daily ?? 0) ||
      nextPlayedAtDate !== (row.played_at_date ?? null) ||
      nextLongWords !== Number(row.long_words_count ?? 0)
    ) {
      await db
        .updateTable('player_stats')
        .set({
          is_daily: nextIsDaily,
          played_at_date: nextPlayedAtDate,
          long_words_count: nextLongWords,
        })
        .where('id', '=', row.id)
        .execute();
    }
  }
}

export const ASYNC_MIGRATIONS: readonly AsyncMigration[] = [
  {
    version: '0001-baseline',
    description:
      'Adopt pre-migration schema drift: player preferences, puzzle is_active, no-hint scores, and retired transfer-token table',
    async up(db) {
      await ensureColumnAsync(db, 'players', 'preferences', 'TEXT');
      await ensureColumnAsync(db, 'puzzles', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
      await ensureColumnAsync(
        db,
        'player_stats',
        'best_no_hint_score',
        'INTEGER NOT NULL DEFAULT 0',
      );
      await sql`DROP TABLE IF EXISTS player_transfer_tokens`.execute(db);
    },
  },
  {
    version: '0002-add-puzzle-max-score',
    description: 'Add max_score to puzzles table and backfill existing puzzles',
    async up(db) {
      await ensureColumnAsync(db, 'puzzles', 'max_score', 'INTEGER');
      await recomputePuzzleMaxScoresAsync(db, true);
    },
  },
  {
    version: '0003-seed-curated-blocked-words',
    description: 'Seed curated slurs, hate speech, and explicit violence into blocked_words',
    async up(db) {
      await seedCuratedBlockedWordsAsync(db);
      await recomputePuzzleMaxScoresAsync(db, false);
    },
  },
  {
    version: '0004-add-player-stats-long-words-and-streak-integrity',
    description:
      'Add long_words_count, is_daily, and played_at_date to player_stats table and backfill historical rows',
    async up(db) {
      await ensureColumnAsync(db, 'player_stats', 'long_words_count', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumnAsync(db, 'player_stats', 'is_daily', 'INTEGER NOT NULL DEFAULT 0');
      await ensureColumnAsync(db, 'player_stats', 'played_at_date', 'TEXT DEFAULT NULL');
      await backfillPlayerStatsAsync(db);
    },
  },
  {
    version: '0005-add-player-transfer-tickets',
    description:
      'Add player_transfer_tickets table for short-lived 15-minute pairing tickets and 6-digit codes',
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

  for (const statement of splitSqlStatements(BASELINE_SQL)) {
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
