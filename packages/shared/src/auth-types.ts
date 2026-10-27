/**
 * Authentication and sync types shared between web and server.
 */

import type { PlayerStats } from './stats.js';

/** Storage key where the player auth token is persisted. */
export const AUTH_TOKEN_STORAGE_KEY = 'sanakenno_auth_token';

/** Stored auth token shape. */
export interface AuthToken {
  token: string;
  playerId: number;
  expiresAt: string;
  playerKey?: string;
  linked?: boolean;
}

/** Wire shape for a puzzle state in sync requests and responses. */
export interface SyncPuzzleState {
  puzzle_number: number;
  found_words: string[];
  score: number;
  hints_unlocked: string[];
  started_at: number;
  total_paused_ms: number;
  score_before_hints: number | null;
}

/** Combined gameplay progress snapshot pushed by web after an accepted word. */
export interface SyncProgressPayload extends SyncPuzzleState {
  date: string;
  max_score: number;
  best_no_hint_score?: number;
}

/** Valid identifiers for the color palette ("Väriteema") selection. */
export const THEME_IDS = ['hehku', 'meri', 'metsa', 'yo', 'aamu', 'mono'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME_ID: ThemeId = 'hehku';

export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Player-scoped display preferences, synced across devices via the account.
 */
export interface PlayerPreferences {
  themeId?: ThemeId;
  themePreference?: ThemePreference;
  updated_at: string;
}

/** Full sync payload returned by GET /api/player/sync and POST /api/player/auth/transfer/use. */
export interface SyncPayload {
  stats: PlayerStats;
  puzzle_states: SyncPuzzleState[];
  preferences?: PlayerPreferences | null;
}
