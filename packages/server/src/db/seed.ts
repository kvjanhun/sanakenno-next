import type { Kysely } from 'kysely';
import { createDb } from './connection.js';
import type { Database } from './schema.js';

/**
 * Deterministically seed a development or ephemeral E2E database with sample Finnish puzzles,
 * combinations, config, and player stats.
 */
export async function seedDatabase(db: Kysely<Database>): Promise<void> {
  const existing = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();

  if (Number(existing.count) > 0) {
    return;
  }

  await db
    .insertInto('puzzles')
    .values([
      {
        slot: 1,
        letters: 'a,e,i,k,l,n,s',
        center: 'a',
        is_active: 1,
      },
      {
        slot: 2,
        letters: 'e,h,i,k,n,o,s',
        center: 'n',
        is_active: 1,
      },
    ])
    .execute();

  await db
    .insertInto('combinations')
    .values([
      {
        letters: 'aeiklns',
        total_pangrams: 1,
        min_word_count: 25,
        max_word_count: 42,
        min_max_score: 90,
        max_max_score: 140,
        variations: JSON.stringify([{ center: 'a', word_count: 35, max_score: 120, pangrams: 1 }]),
        in_rotation: 1,
      },
    ])
    .onConflict((oc) => oc.column('letters').doNothing())
    .execute();

  await db
    .insertInto('config')
    .values({ key: 'epoch_date', value: '2026-01-01' })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const db = createDb();
  await seedDatabase(db);
  await db.destroy();
}
