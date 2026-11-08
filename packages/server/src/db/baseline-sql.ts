import { getHelsinkiDateString } from '@sanakenno/shared';
import type BetterSqlite3 from 'better-sqlite3';
import { computePuzzle } from '../features/puzzle/wordlist.js';

/**
 * Complete SQLite baseline schema matching Sanakenno 1.0 `server/db/schema.sql`.
 */
export const BASELINE_SQL = `
CREATE TABLE IF NOT EXISTS puzzles (
    slot        INTEGER PRIMARY KEY,
    letters     TEXT NOT NULL,
    center      TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    max_score   INTEGER,
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
    long_words_count   INTEGER NOT NULL DEFAULT 0,
    is_daily           INTEGER NOT NULL DEFAULT 0,
    played_at_date     TEXT DEFAULT NULL,
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
  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table);
  if (!tableExists) return;
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((r) => r.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

export const CURATED_BLOCKED_WORDS: readonly string[] = [
  'hintti',
  'hinttiys',
  'horo',
  'huora',
  'huorahtava',
  'huorata',
  'huoruus',
  'insesti',
  'jutku',
  'lutka',
  'manne',
  'natsilainen',
  'natsitervehdys',
  'neekeri',
  'neekeriorja',
  'neekeriorjuus',
  'pederasti',
  'pederastia',
  'pederastinen',
  'pedofiili',
  'pedofiilinen',
  'raiskaaja',
  'raiskata',
  'raiskaus',
  'ryssä',
  'ryssäviha',
];

function hasTable(db: BetterSqlite3.Database, table: string): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table) !==
    undefined
  );
}

function seedCuratedBlockedWords(db: BetterSqlite3.Database): void {
  if (!hasTable(db, 'blocked_words')) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO blocked_words (word) VALUES (?)');
  for (const word of CURATED_BLOCKED_WORDS) {
    stmt.run(word);
  }
}

export function recomputePuzzleMaxScores(db: BetterSqlite3.Database, onlyNull = false): number {
  if (!hasTable(db, 'puzzles')) return 0;
  seedCuratedBlockedWords(db);

  const query = onlyNull
    ? 'SELECT slot, letters, center FROM puzzles WHERE max_score IS NULL'
    : 'SELECT slot, letters, center FROM puzzles';
  const rows = db.prepare(query).all() as Array<{
    slot: number;
    letters: string;
    center: string;
  }>;
  if (rows.length === 0) return 0;

  let blockedWords: string[] = [];
  if (hasTable(db, 'blocked_words')) {
    try {
      const blockedRows = db.prepare('SELECT word FROM blocked_words').all() as Array<{
        word: string;
      }>;
      blockedWords = blockedRows.map((r) => r.word);
    } catch {
      blockedWords = [];
    }
  }

  const updateStmt = db.prepare('UPDATE puzzles SET max_score = ? WHERE slot = ?');
  let updated = 0;
  for (const row of rows) {
    try {
      const data = computePuzzle(row.letters, row.center, blockedWords);
      if (data && typeof data.max_score === 'number') {
        updateStmt.run(data.max_score, row.slot);
        updated += 1;
      }
    } catch {
      // Opportunistic query backfill handles missing wordlist environments
    }
  }
  return updated;
}

export interface BackfillStatsSummary {
  statsBackfilled: number;
  dailyStatsCount: number;
  longWordsBackfilledCount: number;
}

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
  {
    version: '0002-add-puzzle-max-score',
    description: 'Add max_score to puzzles table and backfill existing puzzles',
    up(db) {
      ensureColumn(db, 'puzzles', 'max_score', 'INTEGER');
      recomputePuzzleMaxScores(db, true);
    },
  },
  {
    version: '0003-seed-curated-blocked-words',
    description: 'Seed curated slurs, hate speech, and explicit violence into blocked_words',
    up(db) {
      seedCuratedBlockedWords(db);
      recomputePuzzleMaxScores(db, false);
    },
  },
  {
    version: '0004-add-player-stats-long-words-and-streak-integrity',
    description:
      'Add long_words_count, is_daily, and played_at_date to player_stats table and backfill historical rows',
    up(db) {
      ensureColumn(db, 'player_stats', 'long_words_count', 'INTEGER NOT NULL DEFAULT 0');
      ensureColumn(db, 'player_stats', 'is_daily', 'INTEGER NOT NULL DEFAULT 0');
      ensureColumn(db, 'player_stats', 'played_at_date', 'TEXT DEFAULT NULL');
      backfillPlayerStatsInDb(db);
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
