import { z } from 'zod';
import { HintDataSchema } from './domain.js';

export const PuzzleResponseSchema = z.object({
  center: z.string().length(1),
  letters: z.array(z.string().length(1)),
  word_hashes: z.array(z.string()),
  hint_data: HintDataSchema,
  max_score: z.number().int().nonnegative(),
  puzzle_number: z.number().int().nonnegative(),
  display_number: z.number().int().positive(),
  total_puzzles: z.number().int().nonnegative(),
});

export type PuzzleResponse = z.infer<typeof PuzzleResponseSchema>;

export const PuzzleWordsResponseSchema = z.object({
  puzzle_number: z.number().int().nonnegative(),
  display_number: z.number().int().positive(),
  center: z.string().length(1),
  letters: z.array(z.string().length(1)),
  words: z.array(z.string()),
  max_score: z.number().int().nonnegative(),
});

export type PuzzleWordsResponse = z.infer<typeof PuzzleWordsResponseSchema>;

export const ArchiveEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  puzzle_number: z.number().int().nonnegative(),
  display_number: z.number().int().positive(),
  letters: z.array(z.string().length(1)),
  center: z.string().length(1),
  is_today: z.boolean(),
  max_score: z.number().int().nonnegative(),
});

export type ArchiveEntry = z.infer<typeof ArchiveEntrySchema>;

export const ArchiveResponseSchema = z.array(ArchiveEntrySchema);

export type ArchiveResponse = z.infer<typeof ArchiveResponseSchema>;
