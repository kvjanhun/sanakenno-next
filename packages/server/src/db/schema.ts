import type { Generated } from 'kysely';

export interface PuzzlesTable {
  slot: Generated<number>;
  letters: string;
  center: string;
  is_active: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface BlockedWordsTable {
  id: Generated<number>;
  word: string;
  blocked_at: Generated<string>;
}

export interface AchievementsTable {
  id: Generated<number>;
  puzzle_number: number;
  rank: string;
  score: number;
  max_score: number;
  words_found: number;
  elapsed_ms: number | null;
  session_id: string | null;
  achieved_at: Generated<string>;
}

export interface PageViewsTable {
  id: Generated<number>;
  visitor_id: string;
  puzzle_number: number | null;
  path: string;
  viewed_at: Generated<string>;
}

export interface CombinationsTable {
  letters: string;
  total_pangrams: number;
  min_word_count: number;
  max_word_count: number;
  min_max_score: number;
  max_max_score: number;
  variations: string;
  in_rotation: Generated<number>;
}

export interface SuggestionRejectionsTable {
  id: Generated<number>;
  letters_key: string;
  center: string;
  rejected_at: Generated<string>;
}

export interface AdminsTable {
  id: Generated<number>;
  username: string;
  password_hash: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SessionsTable {
  id: string;
  admin_id: number;
  csrf_token: string;
  expires_at: string;
  created_at: Generated<string>;
}

export interface AdminLogTable {
  id: Generated<number>;
  admin_id: number;
  action: string;
  detail: string | null;
  created_at: Generated<string>;
}

export interface ConfigTable {
  key: string;
  value: string;
}

export interface FailedGuessesTable {
  id: Generated<number>;
  word: string;
  puzzle_date: string;
  count: Generated<number>;
  first_at: Generated<string>;
  last_at: Generated<string>;
}

export interface WordFindsTable {
  id: Generated<number>;
  word: string;
  puzzle_number: number;
  count: Generated<number>;
  first_at: Generated<string>;
  last_at: Generated<string>;
}

export interface PlayersTable {
  id: Generated<number>;
  player_key_hash: string;
  email?: string | null;
  preferences: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface PlayerSessionsTable {
  id: string;
  player_id: number;
  expires_at: string;
  created_at: Generated<string>;
}

export interface PlayerStatsTable {
  id: Generated<number>;
  player_id: number;
  puzzle_number: number;
  date: string;
  best_rank: string;
  best_score: Generated<number>;
  max_score: Generated<number>;
  words_found: Generated<number>;
  hints_used: Generated<number>;
  elapsed_ms: Generated<number>;
  longest_word: string | null;
  pangrams_found: Generated<number>;
  best_no_hint_score: Generated<number>;
  updated_at: Generated<string>;
}

export interface PlayerPuzzleStatesTable {
  id: Generated<number>;
  player_id: number;
  puzzle_number: number;
  found_words: Generated<string>;
  score: Generated<number>;
  hints_unlocked: Generated<string>;
  started_at: Generated<number>;
  total_paused_ms: Generated<number>;
  score_before_hints: number | null;
  updated_at: Generated<string>;
}

export interface SchemaMigrationsTable {
  version: string;
  applied_at: Generated<string>;
}

export interface Database {
  puzzles: PuzzlesTable;
  blocked_words: BlockedWordsTable;
  achievements: AchievementsTable;
  page_views: PageViewsTable;
  combinations: CombinationsTable;
  suggestion_rejections: SuggestionRejectionsTable;
  admins: AdminsTable;
  sessions: SessionsTable;
  admin_log: AdminLogTable;
  config: ConfigTable;
  failed_guesses: FailedGuessesTable;
  word_finds: WordFindsTable;
  players: PlayersTable;
  player_sessions: PlayerSessionsTable;
  player_stats: PlayerStatsTable;
  player_puzzle_states: PlayerPuzzleStatesTable;
  schema_migrations: SchemaMigrationsTable;
}
