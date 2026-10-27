import type BetterSqlite3 from 'better-sqlite3';

/**
 * Complete SQLite baseline schema matching Sanakenno 1.0 `server/db/schema.sql`.
 */
export const BASELINE_SQL = `
CREATE TABLE IF NOT EXISTS puzzles (
    slot        INTEGER PRIMARY KEY,
    letters     TEXT NOT NULL,
    center      TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blocked_words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT NOT NULL UNIQUE,
    blocked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS achievements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    puzzle_number   INTEGER NOT NULL,
    rank            TEXT NOT NULL,
    score           INTEGER NOT NULL,
    max_score       INTEGER NOT NULL,
    words_found     INTEGER NOT NULL,
    elapsed_ms      INTEGER,
    session_id      TEXT,
    achieved_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS page_views (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id      TEXT NOT NULL,
    puzzle_number   INTEGER,
    path            TEXT NOT NULL,
    viewed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_views_date ON page_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(visitor_id);

CREATE TABLE IF NOT EXISTS combinations (
    letters         TEXT PRIMARY KEY,
    total_pangrams  INTEGER NOT NULL,
    min_word_count  INTEGER NOT NULL,
    max_word_count  INTEGER NOT NULL,
    min_max_score   INTEGER NOT NULL,
    max_max_score   INTEGER NOT NULL,
    variations      TEXT NOT NULL,
    in_rotation     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suggestion_rejections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    letters_key  TEXT NOT NULL,
    center       TEXT NOT NULL,
    rejected_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(letters_key, center)
);
CREATE INDEX IF NOT EXISTS idx_suggestion_rejections_rejected_at
    ON suggestion_rejections(rejected_at);

CREATE TABLE IF NOT EXISTS admins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    admin_id        INTEGER NOT NULL REFERENCES admins(id),
    csrf_token      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL REFERENCES admins(id),
    action      TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_log_date ON admin_log(created_at);

CREATE TABLE IF NOT EXISTS config (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS failed_guesses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT NOT NULL,
    puzzle_date TEXT NOT NULL,
    count       INTEGER NOT NULL DEFAULT 1,
    first_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(word, puzzle_date)
);
CREATE INDEX IF NOT EXISTS idx_failed_guesses_word ON failed_guesses(word);
CREATE INDEX IF NOT EXISTS idx_failed_guesses_date ON failed_guesses(puzzle_date);

CREATE TABLE IF NOT EXISTS word_finds (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    word          TEXT NOT NULL,
    puzzle_number INTEGER NOT NULL,
    count         INTEGER NOT NULL DEFAULT 1,
    first_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(word, puzzle_number)
);
CREATE INDEX IF NOT EXISTS idx_word_finds_word ON word_finds(word);
CREATE INDEX IF NOT EXISTS idx_word_finds_puzzle ON word_finds(puzzle_number);

CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    player_key_hash TEXT NOT NULL UNIQUE,
    preferences     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS player_sessions (
    id         TEXT PRIMARY KEY,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_player_sessions_expires ON player_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_player_sessions_player  ON player_sessions(player_id);

CREATE TABLE IF NOT EXISTS player_stats (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    puzzle_number      INTEGER NOT NULL,
    date               TEXT NOT NULL,
    best_rank          TEXT NOT NULL,
    best_score         INTEGER NOT NULL DEFAULT 0,
    max_score          INTEGER NOT NULL DEFAULT 0,
    words_found        INTEGER NOT NULL DEFAULT 0,
    hints_used         INTEGER NOT NULL DEFAULT 0,
    elapsed_ms         INTEGER NOT NULL DEFAULT 0,
    longest_word       TEXT DEFAULT NULL,
    pangrams_found     INTEGER NOT NULL DEFAULT 0,
    best_no_hint_score INTEGER NOT NULL DEFAULT 0,
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(player_id, puzzle_number)
);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id);

CREATE TABLE IF NOT EXISTS player_puzzle_states (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    puzzle_number      INTEGER NOT NULL,
    found_words        TEXT NOT NULL DEFAULT '[]',
    score              INTEGER NOT NULL DEFAULT 0,
    hints_unlocked     TEXT NOT NULL DEFAULT '[]',
    started_at         INTEGER NOT NULL DEFAULT 0,
    total_paused_ms    INTEGER NOT NULL DEFAULT 0,
    score_before_hints INTEGER,
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(player_id, puzzle_number)
);
CREATE INDEX IF NOT EXISTS idx_player_puzzle_states_player ON player_puzzle_states(player_id);
`;

export interface Migration {
  version: string;
  description: string;
  up: (db: BetterSqlite3.Database) => void;
}

function ensureColumn(
  db: BetterSqlite3.Database,
  table: string,
  column: string,
  decl: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((r) => r.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: '0001-baseline',
    description:
      'Adopt pre-migration schema drift: player preferences, puzzle is_active, no-hint scores, and retired transfer-token table',
    up(db) {
      ensureColumn(db, 'players', 'preferences', 'TEXT');
      ensureColumn(db, 'puzzles', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
      ensureColumn(db, 'player_stats', 'best_no_hint_score', 'INTEGER NOT NULL DEFAULT 0');
      db.exec('DROP TABLE IF EXISTS player_transfer_tokens');
    },
  },
];

/**
 * Apply pending migrations in order inside BEGIN IMMEDIATE writer locks.
 */
export function runMigrations(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const isApplied = (version: string): boolean =>
    db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version) !== undefined;

  for (const migration of MIGRATIONS) {
    if (isApplied(migration.version)) continue;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!isApplied(migration.version)) {
        migration.up(db);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* preserve original error */
      }
      throw err;
    }
  }
}
