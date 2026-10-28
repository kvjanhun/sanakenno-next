import type { AchievementPayload } from '@sanakenno/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';

/**
 * Return true if the puzzle slot exists and has `is_active = 1`.
 */
export async function isActivePuzzleSlot(db: Kysely<Database>, slot: number): Promise<boolean> {
  const row = await db
    .selectFrom('puzzles')
    .select('is_active')
    .where('slot', '=', slot)
    .executeTakeFirst();

  return row !== undefined && Number(row.is_active) === 1;
}

/**
 * Insert a new achievement row into `achievements`.
 */
export async function insertAchievement(
  db: Kysely<Database>,
  payload: AchievementPayload,
): Promise<void> {
  await db
    .insertInto('achievements')
    .values({
      puzzle_number: payload.puzzle_number,
      rank: payload.rank,
      score: payload.score,
      max_score: payload.max_score,
      words_found: payload.words_found,
      elapsed_ms: payload.elapsed_ms ?? null,
      session_id: payload.session_id ?? null,
    })
    .execute();
}

/**
 * Upsert a failed guess into `failed_guesses` on `UNIQUE(word, puzzle_date)`,
 * incrementing `count` and refreshing `last_at`.
 */
export async function upsertFailedGuess(
  db: Kysely<Database>,
  word: string,
  puzzleDate: string,
): Promise<void> {
  await db
    .insertInto('failed_guesses')
    .values({
      word,
      puzzle_date: puzzleDate,
      count: 1,
    })
    .onConflict((oc) =>
      oc.columns(['word', 'puzzle_date']).doUpdateSet({
        count: sql<number>`count + 1`,
        last_at: sql<string>`datetime('now')`,
      }),
    )
    .execute();
}

/**
 * Upsert a word find into `word_finds` on `UNIQUE(word, puzzle_number)`,
 * incrementing `count` and refreshing `last_at`.
 */
export async function upsertWordFind(
  db: Kysely<Database>,
  word: string,
  puzzleNumber: number,
): Promise<void> {
  await db
    .insertInto('word_finds')
    .values({
      word,
      puzzle_number: puzzleNumber,
      count: 1,
    })
    .onConflict((oc) =>
      oc.columns(['word', 'puzzle_number']).doUpdateSet({
        count: sql<number>`count + 1`,
        last_at: sql<string>`datetime('now')`,
      }),
    )
    .execute();
}
