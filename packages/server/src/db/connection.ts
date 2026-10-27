import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

const BASELINE_SQL = `
  CREATE TABLE IF NOT EXISTS puzzles (
    slot INTEGER PRIMARY KEY,
    letters TEXT NOT NULL,
    center TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * Create a typed Kysely SQLite database instance and ensure baseline tables exist.
 */
export function createDb(dbPath = process.env.DB_PATH ?? './sanakenno.dev.db'): Kysely<Database> {
  const sqlite = new SQLite(dbPath);
  if (dbPath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec(BASELINE_SQL);

  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: sqlite,
    }),
  });
}
