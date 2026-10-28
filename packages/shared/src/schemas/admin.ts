import { z } from 'zod';

export const AdminLoginPayloadSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type AdminLoginPayload = z.infer<typeof AdminLoginPayloadSchema>;

export const AdminSessionResponseSchema = z.object({
  username: z.string(),
  csrfToken: z.string(),
});
export type AdminSessionResponse = z.infer<typeof AdminSessionResponseSchema>;

export const AdminChangePasswordPayloadSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});
export type AdminChangePasswordPayload = z.infer<typeof AdminChangePasswordPayloadSchema>;

export const AdminPuzzleSavePayloadSchema = z.object({
  slot: z.number().int().positive().optional(),
  letters: z.string().trim().min(7),
  center: z.string().trim().length(1),
  force: z.boolean().optional(),
});
export type AdminPuzzleSavePayload = z.infer<typeof AdminPuzzleSavePayloadSchema>;

export const AdminPuzzleSwapPayloadSchema = z.object({
  slotA: z.number().int().positive(),
  slotB: z.number().int().positive(),
});
export type AdminPuzzleSwapPayload = z.infer<typeof AdminPuzzleSwapPayloadSchema>;

export const AdminPuzzleCenterPayloadSchema = z.object({
  slot: z.number().int().positive(),
  center: z.string().trim().length(1),
});
export type AdminPuzzleCenterPayload = z.infer<typeof AdminPuzzleCenterPayloadSchema>;

export const AdminPreviewPayloadSchema = z.object({
  letters: z.string().trim().min(7),
  center: z.string().trim().length(1),
});
export type AdminPreviewPayload = z.infer<typeof AdminPreviewPayloadSchema>;

export const AdminBlockWordPayloadSchema = z.object({
  word: z.string().trim().min(1),
});
export type AdminBlockWordPayload = z.infer<typeof AdminBlockWordPayloadSchema>;

export const BlockedWordEntrySchema = z.object({
  id: z.number().int().positive(),
  word: z.string(),
  blocked_at: z.string(),
});
export type BlockedWordEntry = z.infer<typeof BlockedWordEntrySchema>;

export const AdminScheduleEntrySchema = z.object({
  date: z.string(),
  dayOfWeek: z.string(),
  displayNumber: z.number().int().positive(),
  slot: z.number().int().positive(),
  center: z.string(),
  letters: z.string(),
  pangramCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  maxScore: z.number().int().nonnegative(),
});
export type AdminScheduleEntry = z.infer<typeof AdminScheduleEntrySchema>;

export const PangramQualityGradeSchema = z.enum(['reject', 'risky', 'ok', 'good']);
export type PangramQualityGrade = z.infer<typeof PangramQualityGradeSchema>;

export const SuggestionQualityGradeSchema = z.enum(['reject', 'risky', 'ok', 'good', 'unreviewed']);
export type SuggestionQualityGrade = z.infer<typeof SuggestionQualityGradeSchema>;

export const AdminCombinationVariationSchema = z.object({
  center: z.string(),
  word_count: z.number(),
  max_score: z.number(),
  pangrams: z.number(),
});
export type AdminCombinationVariation = z.infer<typeof AdminCombinationVariationSchema>;

export const AdminCombinationItemSchema = z.object({
  letters: z.string(),
  total_pangrams: z.number(),
  min_word_count: z.number(),
  max_word_count: z.number(),
  min_max_score: z.number(),
  max_max_score: z.number(),
  variations: z.array(AdminCombinationVariationSchema),
  in_rotation: z.boolean(),
});
export type AdminCombinationItem = z.infer<typeof AdminCombinationItemSchema>;

export const AdminCombinationsResponseSchema = z.object({
  combinations: z.array(AdminCombinationItemSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
  per_page: z.number(),
});
export type AdminCombinationsResponse = z.infer<typeof AdminCombinationsResponseSchema>;

export const AdminSuggestionOverlapSchema = z.object({
  slot: z.number().nullable(),
  shared_letters: z.number(),
  shared_short_words: z.number(),
});
export type AdminSuggestionOverlap = z.infer<typeof AdminSuggestionOverlapSchema>;

export const AdminSuggestionResponseSchema = z.object({
  letters: z.array(z.string()),
  letters_key: z.string(),
  center: z.string(),
  word_count: z.number(),
  pangram_count: z.number(),
  max_score: z.number(),
  quality_grade: SuggestionQualityGradeSchema,
  quality_label: z.string(),
  score: z.number(),
  overlaps: z.object({
    previous: AdminSuggestionOverlapSchema,
    next: AdminSuggestionOverlapSchema,
  }),
  variations: z.array(AdminCombinationVariationSchema),
  reasons: z.array(z.string()),
  pangrams: z.array(z.string()).optional(),
});
export type AdminSuggestionResponse = z.infer<typeof AdminSuggestionResponseSchema>;

export const AdminSuggestionRejectionSchema = z.object({
  id: z.number(),
  letters_key: z.string(),
  letters: z.array(z.string()),
  center: z.string(),
  rejected_at: z.string(),
});
export type AdminSuggestionRejection = z.infer<typeof AdminSuggestionRejectionSchema>;

export const AdminSuggestionRejectionPayloadSchema = z.object({
  letters: z.string().or(z.array(z.string())),
  center: z.string().trim().length(1),
});
export type AdminSuggestionRejectionPayload = z.infer<typeof AdminSuggestionRejectionPayloadSchema>;

export const AdminAchievementsResponseSchema = z.object({
  days: z.number(),
  daily: z.array(
    z.object({
      date: z.string(),
      counts: z.record(z.string(), z.number()),
      total: z.number(),
    }),
  ),
  totals: z.record(z.string(), z.number()),
  mode: z.enum(['users', 'all']),
});
export type AdminAchievementsResponse = z.infer<typeof AdminAchievementsResponseSchema>;

export const AdminFailedGuessesResponseSchema = z.object({
  days: z.number(),
  daily: z.array(
    z.object({
      date: z.string(),
      total_count: z.number(),
      words: z.array(
        z.object({
          word: z.string(),
          count: z.number(),
        }),
      ),
    }),
  ),
  grand_total: z.number(),
});
export type AdminFailedGuessesResponse = z.infer<typeof AdminFailedGuessesResponseSchema>;

export const AdminWordFindsResponseSchema = z.object({
  puzzle_number: z.number(),
  display_number: z.number(),
  center: z.string(),
  letters: z.string(),
  total_words: z.number(),
  recorded_words: z.number(),
  total_finds: z.number(),
  words: z.array(
    z.object({
      word: z.string(),
      find_count: z.number(),
    }),
  ),
});
export type AdminWordFindsResponse = z.infer<typeof AdminWordFindsResponseSchema>;
