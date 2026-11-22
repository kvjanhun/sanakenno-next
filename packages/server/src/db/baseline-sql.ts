/**
 * Complete SQLite / libSQL baseline DDL statements for fresh databases.
 */
export const BASELINE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS puzzles (
    slot          INTEGER PRIMARY KEY,
    letters       TEXT NOT NULL,
    center        TEXT NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    max_score     INTEGER,
    computed_data TEXT DEFAULT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS blocked_words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT NOT NULL UNIQUE,
    blocked_at  TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS achievements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    puzzle_number   INTEGER NOT NULL,
    rank            TEXT NOT NULL,
    score           INTEGER NOT NULL,
    max_score       INTEGER NOT NULL,
    words_found     INTEGER NOT NULL,
    elapsed_ms      INTEGER,
    session_id      TEXT,
    achieved_at     TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS combinations (
    letters         TEXT PRIMARY KEY,
    total_pangrams  INTEGER NOT NULL,
    min_word_count  INTEGER NOT NULL,
    max_word_count  INTEGER NOT NULL,
    min_max_score   INTEGER NOT NULL,
    max_max_score   INTEGER NOT NULL,
    variations      TEXT NOT NULL,
    in_rotation     INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS suggestion_rejections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    letters_key  TEXT NOT NULL,
    center       TEXT NOT NULL,
    rejected_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(letters_key, center)
)`,
  `CREATE INDEX IF NOT EXISTS idx_suggestion_rejections_rejected_at
    ON suggestion_rejections(rejected_at)`,
  `CREATE TABLE IF NOT EXISTS admins (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    admin_id        INTEGER NOT NULL REFERENCES admins(id),
    csrf_token      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS admin_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL REFERENCES admins(id),
    action      TEXT NOT NULL,
    detail      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_log_admin ON admin_log(admin_id)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_log_date ON admin_log(created_at)`,
  `CREATE TABLE IF NOT EXISTS config (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS failed_guesses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT NOT NULL,
    puzzle_date TEXT NOT NULL,
    count       INTEGER NOT NULL DEFAULT 1,
    first_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(word, puzzle_date)
)`,
  `CREATE INDEX IF NOT EXISTS idx_failed_guesses_word ON failed_guesses(word)`,
  `CREATE INDEX IF NOT EXISTS idx_failed_guesses_date ON failed_guesses(puzzle_date)`,
  `CREATE TABLE IF NOT EXISTS word_finds (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    word          TEXT NOT NULL,
    puzzle_number INTEGER NOT NULL,
    count         INTEGER NOT NULL DEFAULT 1,
    first_at      TEXT NOT NULL DEFAULT (datetime('now')),
    last_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(word, puzzle_number)
)`,
  `CREATE INDEX IF NOT EXISTS idx_word_finds_word ON word_finds(word)`,
  `CREATE INDEX IF NOT EXISTS idx_word_finds_puzzle ON word_finds(puzzle_number)`,
  `CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    player_key_hash TEXT NOT NULL UNIQUE,
    preferences     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS player_sessions (
    id         TEXT PRIMARY KEY,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_player_sessions_expires ON player_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_player_sessions_player  ON player_sessions(player_id)`,
  `CREATE TABLE IF NOT EXISTS player_transfer_tickets (
    id         TEXT PRIMARY KEY,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    code       TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at    TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_tickets_code ON player_transfer_tickets(code)`,
  `CREATE INDEX IF NOT EXISTS idx_transfer_tickets_expires ON player_transfer_tickets(expires_at)`,
  `CREATE TABLE IF NOT EXISTS player_puzzle_states (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id          INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    puzzle_number      INTEGER NOT NULL,
    found_words        TEXT NOT NULL DEFAULT '[]',
    score              INTEGER NOT NULL DEFAULT 0,
    hints_unlocked     TEXT NOT NULL DEFAULT '[]',
    started_at         INTEGER NOT NULL DEFAULT 0,
    total_paused_ms    INTEGER NOT NULL DEFAULT 0,
    score_before_hints INTEGER,
    revealed           INTEGER NOT NULL DEFAULT 0,
    date               TEXT DEFAULT NULL,
    max_score          INTEGER NOT NULL DEFAULT 0,
    is_daily           INTEGER NOT NULL DEFAULT 0,
    played_at_date     TEXT DEFAULT NULL,
    elapsed_ms         INTEGER NOT NULL DEFAULT 0,
    frozen_stats_json  TEXT DEFAULT NULL,
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(player_id, puzzle_number)
)`,
  `CREATE INDEX IF NOT EXISTS idx_player_puzzle_states_player ON player_puzzle_states(player_id)`,
];

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
