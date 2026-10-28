import { z } from 'zod';
import { RANK_NAMES } from '../scoring.js';
import {
  PlayerPreferencesSchema,
  PlayerStatsSchema,
  PuzzleStateSchema,
  StatsRecordSchema,
  SyncPayloadSchema,
} from './domain.js';

export const PlayerAuthInitResponseSchema = z.object({
  player_key: z.string().min(1),
  token: z.string().min(1),
  player_id: z.number().int().positive(),
});

export type PlayerAuthInitResponse = z.infer<typeof PlayerAuthInitResponseSchema>;

export const PlayerAuthRotateResponseSchema = z.object({
  player_key: z.string().min(1),
});

export type PlayerAuthRotateResponse = z.infer<typeof PlayerAuthRotateResponseSchema>;

export const PlayerMeResponseSchema = z.object({
  player_id: z.number().int().positive(),
});

export type PlayerMeResponse = z.infer<typeof PlayerMeResponseSchema>;

export const TransferCreatePayloadSchema = z.object({
  email: z.string().trim().min(1),
  player_key: z.string().trim().min(1),
});

export type TransferCreatePayload = z.infer<typeof TransferCreatePayloadSchema>;

export const TransferUsePayloadSchema = z.object({
  token: z.string().trim().min(1),
  stats: PlayerStatsSchema.optional(),
  puzzle_states: z.array(PuzzleStateSchema).optional(),
});

export type TransferUsePayload = z.infer<typeof TransferUsePayloadSchema>;

export const TransferUseResponseSchema = SyncPayloadSchema.extend({
  token: z.string().min(1),
  player_id: z.number().int().positive(),
});

export type TransferUseResponse = z.infer<typeof TransferUseResponseSchema>;

export const SyncProgressPayloadSchema = PuzzleStateSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_score: z.number().int().nonnegative(),
  best_no_hint_score: z.number().int().nonnegative().optional(),
});

export const SyncStatsPayloadSchema = StatsRecordSchema;
export const SyncStatePayloadSchema = PuzzleStateSchema;
export const SyncPreferencesPayloadSchema = PlayerPreferencesSchema;

export const AchievementPayloadSchema = z.object({
  puzzle_number: z.number().int().nonnegative(),
  rank: z.enum(RANK_NAMES),
  score: z.number().int().nonnegative(),
  max_score: z.number().int().nonnegative(),
  words_found: z.number().int().nonnegative(),
  elapsed_ms: z.number().int().nonnegative().optional(),
  session_id: z.string().optional(),
});

export type AchievementPayload = z.infer<typeof AchievementPayloadSchema>;

export const FailedGuessPayloadSchema = z.object({
  word: z.string().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type FailedGuessPayload = z.infer<typeof FailedGuessPayloadSchema>;

export const WordFindPayloadSchema = z.object({
  word: z.string().min(1).max(20),
  puzzle_number: z.number().int().nonnegative(),
});

export type WordFindPayload = z.infer<typeof WordFindPayloadSchema>;
