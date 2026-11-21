import { z } from 'zod';

function optionalQueryInt(schema: z.ZodNumber = z.number().int()) {
  return z.preprocess((v) => {
    if (v === '' || v === undefined) return undefined;
    if (typeof v === 'string' && v.trim() === '') return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  }, schema.optional());
}

export const AdminLoginPayloadSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type AdminLoginPayload = z.infer<typeof AdminLoginPayloadSchema>;

export const AdminChangePasswordPayloadSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).min(12),
});
export type AdminChangePasswordPayload = z.infer<typeof AdminChangePasswordPayloadSchema>;

export const AdminPuzzleSavePayloadSchema = z.object({
  slot: z.number().int().nonnegative().optional(),
  letters: z.union([z.string(), z.array(z.string())]),
  center: z.string().trim().length(1),
  force: z.boolean().optional(),
});
export type AdminPuzzleSavePayload = z.infer<typeof AdminPuzzleSavePayloadSchema>;

export const AdminPuzzleSwapPayloadSchema = z
  .object({
    slotA: z.number().int().nonnegative().optional(),
    slotB: z.number().int().nonnegative().optional(),
    slot_a: z.number().int().nonnegative().optional(),
    slot_b: z.number().int().nonnegative().optional(),
  })
  .refine(
    (v) => {
      const a = v.slotA ?? v.slot_a;
      const b = v.slotB ?? v.slot_b;
      return (
        typeof a === 'number' &&
        Number.isInteger(a) &&
        a >= 0 &&
        typeof b === 'number' &&
        Number.isInteger(b) &&
        b >= 0 &&
        a !== b
      );
    },
    { message: 'Molemmat slotit vaaditaan eri ei-negatiivisina kokonaislukuina' },
  );
export type AdminPuzzleSwapPayload = z.infer<typeof AdminPuzzleSwapPayloadSchema>;

export const AdminPuzzleCenterPayloadSchema = z.object({
  slot: z.number().int().nonnegative(),
  center: z.string().trim().length(1),
});
export type AdminPuzzleCenterPayload = z.infer<typeof AdminPuzzleCenterPayloadSchema>;

export const AdminPreviewPayloadSchema = z.object({
  letters: z.union([z.string(), z.array(z.string())]),
  center: z.string().trim().length(1),
});
export type AdminPreviewPayload = z.infer<typeof AdminPreviewPayloadSchema>;

export const AdminBlockWordPayloadSchema = z.object({
  word: z.string().trim().min(1),
});
export type AdminBlockWordPayload = z.infer<typeof AdminBlockWordPayloadSchema>;

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

export const VariationDataSchema = z.object({
  center: z.string(),
  word_count: z.number(),
  max_score: z.number(),
  pangram_count: z.number(),
  is_active: z.boolean().optional(),
});
export type VariationData = z.infer<typeof VariationDataSchema>;

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
  letters: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
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

export const AdminVariationsQuerySchema = z
  .object({
    slot: z.string().optional(),
    display_number: z.string().optional(),
    letters: z.string().optional(),
  })
  .optional();

export const AdminScheduleQuerySchema = z
  .object({
    days: z.string().optional(),
    start: z.string().optional(),
  })
  .optional();

export const AdminCombinationsQuerySchema = z
  .object({
    requires: z.string().optional(),
    excludes: z.string().optional(),
    min_pangrams: optionalQueryInt(z.number().int().nonnegative()),
    max_pangrams: optionalQueryInt(z.number().int().nonnegative()),
    min_words: optionalQueryInt(z.number().int().nonnegative()),
    max_words: optionalQueryInt(z.number().int().nonnegative()),
    in_rotation: optionalQueryInt(z.number().int().min(0).max(1)),
    sort: z.string().optional(),
    order: z.string().optional(),
    page: optionalQueryInt(z.number().int().min(1)),
    per_page: optionalQueryInt(z.number().int().min(1).max(200)),
  })
  .optional();

export const AdminSuggestionQuerySchema = z
  .object({
    declined: z.string().optional(),
    min_words: optionalQueryInt(z.number().int().nonnegative()),
    max_words: optionalQueryInt(z.number().int().nonnegative()),
  })
  .optional();

export const AdminAchievementsQuerySchema = z
  .object({
    days: z.string().optional(),
    mode: z.string().optional(),
  })
  .optional();

export const AdminFailedGuessesQuerySchema = z
  .object({
    days: z.string().optional(),
  })
  .optional();

export const AdminWordFindsQuerySchema = z
  .object({
    puzzle_number: z.string().optional(),
    display_number: z.string().optional(),
  })
  .optional();
