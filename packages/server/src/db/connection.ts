import path from 'node:path';
import SQLite from 'better-sqlite3';
import {
  CompiledQuery,
  Kysely,
  sql,
  SqliteDialect,
  SqliteDriver,
  type DatabaseConnection,
  type Driver,
  type SqliteDialectConfig,
} from 'kysely';
import { runMigrationsAsync } from './async-migrations.js';
import { LibsqlDialect } from './libsql-dialect.js';
import {
  isSqliteBusyError,
  runImmediateTransactionWithRetry,
  type ImmediateTransactionOptions,
} from './retry.js';
import type { Database } from './schema.js';

export type DbEngine = 'kysely-sqlite' | 'kysely-libsql';
export { isSqliteBusyError, runImmediateTransactionWithRetry, type ImmediateTransactionOptions };

/**
 * Custom Kysely SQLite driver that begins transactions with `BEGIN IMMEDIATE`
 * so dual-container production instances reserve the writer lock before reading,
 * avoiding deferred read-to-write upgrade deadlocks in WAL mode.
 */
class ImmediateSqliteDriver extends SqliteDriver {
  override async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin immediate'));
  }
}

class ImmediateSqliteDialect extends SqliteDialect {
  readonly #config: SqliteDialectConfig;

  constructor(config: SqliteDialectConfig) {
    super(config);
    this.#config = config;
  }

  override createDriver(): Driver {
    return new ImmediateSqliteDriver(this.#config);
  }
}

/**
 * Create a typed Kysely SQLite database instance, apply baseline schema, and run async migrations.
 */
export async function createDb(
  dbPath = process.env.DB_PATH ??
    (process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'sanakenno.db') : './sanakenno.dev.db'),
): Promise<Kysely<Database>> {
  const sqlite = new SQLite(dbPath);
  if (dbPath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const db = new Kysely<Database>({
    dialect: new ImmediateSqliteDialect({
      database: sqlite,
    }),
  });
  await runMigrationsAsync(db);
  return db;
}

/** Open a local SQLite file in read-only mode for verification utilities. */
export function openReadonlySqlite(dbPath: string): SQLite.Database {
  return new SQLite(dbPath, { readonly: true });
}

/**
 * Initialize either a managed Turso (libSQL) Kysely connection when `TURSO_DATABASE_URL`
 * is set, or the local `better-sqlite3` database otherwise.
 */
export async function initDb(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ db: Kysely<Database>; engine: DbEngine }> {
  const tursoUrl = env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) {
    const db = new Kysely<Database>({
      dialect: new LibsqlDialect({
        url: tursoUrl,
        authToken: env.TURSO_AUTH_TOKEN?.trim() || undefined,
      }),
    });
    await runMigrationsAsync(db);
    return { db, engine: 'kysely-libsql' };
  }

  const dbPath =
    env.DB_PATH ?? (env.DATA_DIR ? path.join(env.DATA_DIR, 'sanakenno.db') : undefined);
  const db = await createDb(dbPath);
  return { db, engine: 'kysely-sqlite' };
}

/** Return true if at least one puzzle row exists in SQLite. */
export async function hasAnyPuzzles(db: Kysely<Database>): Promise<boolean> {
  const row = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirst();
  return Number(row?.count ?? 0) > 0;
}

/** Flush SQLite WAL frames to the main database file (when local) and destroy the connection pool. */
export async function checkpointAndDestroyDb(
  db: Kysely<Database>,
  engine: DbEngine = 'kysely-sqlite',
): Promise<void> {
  if (engine !== 'kysely-libsql') {
    await sql`PRAGMA wal_checkpoint(TRUNCATE)`.execute(db).catch(() => undefined);
  }
  await db.destroy();
}
