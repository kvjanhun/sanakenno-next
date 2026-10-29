import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getBlockedWords } from '../puzzle/puzzle.queries.js';
import { computePuzzle } from '../puzzle/wordlist.js';

export interface PuzzleRow {
  slot: number;
  letters: string;
  center: string;
  is_active: number;
  max_score?: number | null;
}

export function normalizeLettersKey(letters: string | string[]): string {
  const chars = Array.isArray(letters)
    ? letters.flatMap((l) => Array.from(l.toLowerCase().trim()))
    : Array.from(letters.toLowerCase().replace(/[^a-zåäö]/g, ''));
  return Array.from(new Set(chars)).sort().join('');
}

export async function getAllActivePuzzles(db: Kysely<Database>) {
  return db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'is_active'])
    .where('is_active', '=', 1)
    .orderBy('slot', 'asc')
    .execute();
}

export async function getPuzzleBySlot(db: Kysely<Database>, slot: number) {
  return db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'is_active', 'max_score'])
    .where('slot', '=', slot)
    .executeTakeFirst();
}

export async function getNeighbourSlots(
  db: Kysely<Database>,
  slot: number,
): Promise<{ prev_slot: number | null; next_slot: number | null }> {
  const prevRow = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.max<number | null>('slot').as('prev_slot'))
    .where('slot', '<', slot)
    .executeTakeFirst();

  const nextRow = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.min<number | null>('slot').as('next_slot'))
    .where('slot', '>', slot)
    .executeTakeFirst();

  return {
    prev_slot: prevRow?.prev_slot != null ? Number(prevRow.prev_slot) : null,
    next_slot: nextRow?.next_slot != null ? Number(nextRow.next_slot) : null,
  };
}

export async function findDuplicateConflicts(
  db: Kysely<Database>,
  lettersKey: string,
  excludeSlot?: number,
) {
  const activePuzzles = await getAllActivePuzzles(db);
  const conflicts: Array<{ slot: number; letters: string; center: string }> = [];

  for (const p of activePuzzles) {
    if (excludeSlot !== undefined && p.slot === excludeSlot) continue;
    if (normalizeLettersKey(p.letters) === lettersKey) {
      conflicts.push({ slot: p.slot, letters: p.letters, center: p.center });
    }
  }

  return conflicts;
}

export async function insertOrUpdatePuzzle(
  db: Kysely<Database>,
  slot: number,
  letters: string,
  center: string,
) {
  const blockedWords = await getBlockedWords(db);
  const computed = computePuzzle(letters, center, blockedWords);
  const maxScore = computed.max_score;

  const existing = await getPuzzleBySlot(db, slot);
  if (existing) {
    await db
      .updateTable('puzzles')
      .set({
        letters,
        center,
        max_score: maxScore,
        is_active: 1,
        updated_at: new Date().toISOString(),
      })
      .where('slot', '=', slot)
      .execute();
  } else {
    await db
      .insertInto('puzzles')
      .values({
        slot,
        letters,
        center,
        max_score: maxScore,
        is_active: 1,
      })
      .execute();
  }
}

export async function softDeletePuzzle(db: Kysely<Database>, slot: number) {
  await db
    .updateTable('puzzles')
    .set({
      is_active: 0,
      updated_at: new Date().toISOString(),
    })
    .where('slot', '=', slot)
    .execute();
}

export async function swapPuzzles(db: Kysely<Database>, slotA: number, slotB: number) {
  const pA = await getPuzzleBySlot(db, slotA);
  const pB = await getPuzzleBySlot(db, slotB);
  if (!pA || !pB) {
    throw new Error('Molemmat pelit vaaditaan vaihtoon');
  }

  const now = new Date().toISOString();
  // Temporarily assign slotA to negative slot to avoid conflict
  await db
    .updateTable('puzzles')
    .set({
      letters: pB.letters,
      center: pB.center,
      max_score: pB.max_score,
      is_active: pB.is_active,
      updated_at: now,
    })
    .where('slot', '=', slotA)
    .execute();

  await db
    .updateTable('puzzles')
    .set({
      letters: pA.letters,
      center: pA.center,
      max_score: pA.max_score,
      is_active: pA.is_active,
      updated_at: now,
    })
    .where('slot', '=', slotB)
    .execute();
}

export async function updatePuzzleCenter(db: Kysely<Database>, slot: number, center: string) {
  const puzzle = await getPuzzleBySlot(db, slot);
  if (!puzzle) {
    throw new Error('Peliä ei löydy');
  }
  const blockedWords = await getBlockedWords(db);
  const computed = computePuzzle(puzzle.letters, center, blockedWords);

  await db
    .updateTable('puzzles')
    .set({
      center,
      max_score: computed.max_score,
      updated_at: new Date().toISOString(),
    })
    .where('slot', '=', slot)
    .execute();
}

export async function getBlockedWordsList(db: Kysely<Database>) {
  return db
    .selectFrom('blocked_words')
    .select(['id', 'word', 'blocked_at'])
    .orderBy('word', 'asc')
    .execute();
}

export async function insertBlockedWord(db: Kysely<Database>, word: string) {
  await db
    .insertInto('blocked_words')
    .values({
      word: word.toLowerCase().trim(),
    })
    .execute();
}

export async function deleteBlockedWord(db: Kysely<Database>, id: number) {
  await db.deleteFrom('blocked_words').where('id', '=', id).execute();
}
