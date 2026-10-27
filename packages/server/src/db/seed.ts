import type { Kysely } from 'kysely';
import { createDb } from './connection.js';
import type { Database } from './schema.js';

/**
 * Deterministically seed a development or ephemeral E2E database with sample Finnish puzzles.
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
        letters: 'AEIKLNS',
        center_letter: 'A',
        words: JSON.stringify(['AIKA', 'KANA', 'LASI', 'SANA', 'KANSALLINEN']),
        max_score: 26,
        pangrams: JSON.stringify(['KANSALLINEN']),
        hint_data: null,
        deleted_at: null,
      },
      {
        letters: 'EHIKNNO',
        center_letter: 'N',
        words: JSON.stringify(['KENNO', 'ONNI', 'HIENO', 'KEINONEN']),
        max_score: 21,
        pangrams: JSON.stringify(['KEINONEN']),
        hint_data: null,
        deleted_at: null,
      },
    ])
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
