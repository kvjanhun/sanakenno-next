import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database } from './schema.js';

const BASELINE_SQL = `
  CREATE TABLE IF NOT EXISTS puzzles (
    slot INTEGER PRIMARY KEY AUTOINCREMENT,
    letters TEXT NOT NULL,
    center_letter TEXT NOT NULL,
    words TEXT NOT NULL,
    max_score INTEGER NOT NULL,
    pangrams TEXT NOT NULL,
    hint_data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL
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
  sqlite.exec(BASELINE_SQL);

  return new Kysely<Database>({
    dialect: new SqliteDialect({
      database: sqlite,
    }),
  });
}
