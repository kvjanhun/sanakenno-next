import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  engine: z.enum(['kysely-sqlite', 'kysely-libsql']),
  total_puzzles: z.number().int().nonnegative(),
  days_remaining: z.number().int().nonnegative(),
  timezone: z.literal('Europe/Helsinki'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
