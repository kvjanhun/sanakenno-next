import { z } from 'zod';
import { THEME_IDS } from '../auth-types.js';

export const HintDataSchema = z.object({
  word_count: z.number().int().nonnegative(),
  pangram_count: z.number().int().nonnegative(),
  by_letter: z.record(z.string(), z.number().int().nonnegative()),
  by_length: z.record(z.string(), z.number().int().nonnegative()),
  by_pair: z.record(z.string(), z.number().int().nonnegative()),
});

export const StatsRecordSchema = z.object({
  puzzle_number: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  best_rank: z.string().min(1),
  best_score: z.number().int().nonnegative(),
  max_score: z.number().int().nonnegative(),
  words_found: z.number().int().nonnegative(),
  hints_used: z.number().int().nonnegative(),
  elapsed_ms: z.number().int().nonnegative(),
  longest_word: z.string().optional(),
  pangrams_found: z.number().int().nonnegative().optional(),
  best_no_hint_score: z.number().int().nonnegative().optional(),
});

export const PlayerStatsSchema = z.object({
  records: z.array(StatsRecordSchema),
  version: z.literal(1),
});

export const PuzzleStateSchema = z.object({
  puzzle_number: z.number().int().positive(),
  found_words: z.array(z.string()),
  score: z.number().int().nonnegative(),
  hints_unlocked: z.array(z.string()),
  started_at: z.number().int().nonnegative(),
  total_paused_ms: z.number().int().nonnegative(),
  score_before_hints: z.number().int().nonnegative().nullable(),
});

export const PlayerPreferencesSchema = z.object({
  themeId: z.enum(THEME_IDS).optional(),
  themePreference: z.enum(['light', 'dark', 'system']).optional(),
  updated_at: z.string().min(1),
});

export const SyncPayloadSchema = z.object({
  stats: PlayerStatsSchema,
  puzzle_states: z.array(PuzzleStateSchema),
  preferences: PlayerPreferencesSchema.nullable().optional(),
});
