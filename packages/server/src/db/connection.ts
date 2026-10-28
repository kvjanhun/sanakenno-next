import path from 'node:path';
import SQLite from 'better-sqlite3';
import {
  CompiledQuery,
  Kysely,
  SqliteDialect,
  SqliteDriver,
  type DatabaseConnection,
  type Driver,
  type SqliteDialectConfig,
} from 'kysely';
import { BASELINE_SQL, runMigrations } from './baseline-sql.js';
import type { Database } from './schema.js';

export interface ImmediateTransactionOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

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
 * Create a typed Kysely SQLite database instance, apply baseline schema, and run migrations.
 */
export function createDb(
  dbPath = process.env.DB_PATH ??
    (process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'sanakenno.db') : './sanakenno.dev.db'),
): Kysely<Database> {
  const sqlite = new SQLite(dbPath);
  if (dbPath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec(BASELINE_SQL);
  runMigrations(sqlite);

  return new Kysely<Database>({
    dialect: new ImmediateSqliteDialect({
      database: sqlite,
    }),
  });
}

function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return code === 'SQLITE_BUSY' || error.message.includes('database is locked');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a Kysely `BEGIN IMMEDIATE` transaction with transient SQLITE_BUSY retry backoff.
 */
export async function runImmediateTransactionWithRetry<T>(
  db: Kysely<Database>,
  work: (trx: Kysely<Database>) => Promise<T>,
  options: ImmediateTransactionOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 25;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.transaction().execute((trx) => work(trx));
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt >= maxRetries) {
        throw error;
      }
      const jitterMs = Math.floor(Math.random() * retryDelayMs);
      await delay(retryDelayMs * (attempt + 1) + jitterMs);
    }
  }
}
