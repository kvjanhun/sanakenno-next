import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';

/**
 * Count active (non-soft-deleted) puzzles in the database via Kysely.
 */
export async function countActivePuzzles(db: Kysely<Database>): Promise<number> {
  const row = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('is_active', '=', 1)
    .executeTakeFirstOrThrow();

  return Number(row.count);
}
