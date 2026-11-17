import { z } from 'zod';
import { THEME_IDS } from '../auth-types.js';

export const HintPangramDetailSchema = z.object({
  length: z.number().int().nonnegative(),
  first_letter: z.string().min(1).max(1),
});

export const HintDataSchema = z.object({
  word_count: z.number().int().nonnegative(),
  pangram_count: z.number().int().nonnegative(),
  by_letter: z.record(z.string(), z.number().int().nonnegative()),
  by_length: z.record(z.string(), z.number().int().nonnegative()),
  by_pair: z.record(z.string(), z.number().int().nonnegative()).optional().default({}),
  matrix: z.record(z.string(), z.record(z.string(), z.number().int().nonnegative())).optional(),
  pangram_details: z.array(HintPangramDetailSchema).optional(),
  suffixes: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const StatsRecordSchema = z.object({
  puzzle_number: z.number().int().nonnegative(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  best_rank: z.string().min(1),
  best_score: z.number().int().nonnegative(),
  max_score: z.number().int().nonnegative().optional().default(0),
  words_found: z.number().int().nonnegative().optional().default(0),
  hints_used: z.number().int().nonnegative().optional().default(0),
  elapsed_ms: z.number().int().nonnegative().optional().default(0),
  longest_word: z.string().optional(),
  pangrams_found: z.number().int().nonnegative().optional(),
  best_no_hint_score: z.number().int().nonnegative().optional(),
  is_daily: z.boolean().optional(),
  played_at_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  long_words_count: z.number().int().nonnegative().optional(),
});

export const PlayerStatsSchema = z.object({
  records: z.array(StatsRecordSchema),
  version: z.literal(1).optional().default(1),
});

export const PuzzleStateSchema = z.object({
  puzzle_number: z.number().int().nonnegative(),
  found_words: z.array(z.string()),
  score: z.number().int().nonnegative().optional().default(0),
  hints_unlocked: z.array(z.string()).optional().default([]),
  started_at: z.number().int().nonnegative().optional().default(0),
  total_paused_ms: z.number().int().nonnegative().optional().default(0),
  score_before_hints: z.number().int().nonnegative().nullable().optional().default(null),
});

export const PlayerPreferencesSchema = z.object({
  themeId: z.enum(THEME_IDS).optional().catch(undefined),
  themePreference: z.enum(['light', 'dark', 'system']).optional().catch(undefined),
  updated_at: z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Virheellinen aikaleima'),
});

export const SyncPayloadSchema = z.object({
  stats: PlayerStatsSchema,
  puzzle_states: z.array(PuzzleStateSchema),
  preferences: PlayerPreferencesSchema.nullable().optional(),
});
