import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  engine: z.literal('kysely-sqlite'),
  total_puzzles: z.number().int().nonnegative(),
  timezone: z.literal('Europe/Helsinki'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
