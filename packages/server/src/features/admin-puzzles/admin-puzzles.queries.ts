import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import {
  computePuzzleSlotForDate,
  getBlockedWords,
  getEpochDate,
} from '../puzzle/puzzle.queries.js';
import {
  computePuzzle,
  MIN_WORD_LENGTH,
  normalizeWord,
  parseComputedPuzzleData,
} from '../puzzle/wordlist.js';

export interface PuzzleRow {
  slot: number;
  letters: string;
  center: string;
  is_active: number;
  max_score?: number | null;
  computed_data?: string | null;
}

export function normalizeLettersKey(letters: string | string[]): string {
  const chars = Array.isArray(letters)
    ? letters.flatMap((l) => Array.from(l.toLowerCase().trim()))
    : Array.from(letters.toLowerCase().replace(/[^a-zåäö]/g, ''));
  return Array.from(new Set(chars)).sort().join('');
}

async function getAllActivePuzzles(db: Kysely<Database>) {
  return db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'is_active', 'max_score', 'computed_data'])
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
    .where('is_active', '=', 1)
    .where('slot', '<', slot)
    .executeTakeFirst();

  const nextRow = await db
    .selectFrom('puzzles')
    .select((eb) => eb.fn.min<number | null>('slot').as('next_slot'))
    .where('is_active', '=', 1)
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
  const computedJson = JSON.stringify(computed);

  const existing = await getPuzzleBySlot(db, slot);
  if (existing) {
    await db
      .updateTable('puzzles')
      .set({
        letters,
        center,
        max_score: maxScore,
        computed_data: computedJson,
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
        computed_data: computedJson,
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

export async function swapPuzzles(
  db: Kysely<Database>,
  slotA: number,
  slotB: number,
): Promise<boolean> {
  const rows = await db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center', 'is_active', 'max_score', 'computed_data'])
    .where('slot', 'in', [slotA, slotB])
    .where('is_active', '=', 1)
    .execute();

  const pA = rows.find((r) => Number(r.slot) === slotA);
  const pB = rows.find((r) => Number(r.slot) === slotB);
  if (!pA || !pB) {
    return false;
  }

  const now = new Date().toISOString();
  await db
    .updateTable('puzzles')
    .set({
      letters: pB.letters,
      center: pB.center,
      max_score: pB.max_score,
      computed_data: pB.computed_data,
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
      computed_data: pA.computed_data,
      is_active: pA.is_active,
      updated_at: now,
    })
    .where('slot', '=', slotB)
    .execute();

  return true;
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
      computed_data: JSON.stringify(computed),
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

export async function insertBlockedWord(db: Kysely<Database>, word: string): Promise<boolean> {
  const inserted = await db
    .insertInto('blocked_words')
    .values({
      word: word.toLowerCase().trim(),
    })
    .onConflict((oc) => oc.column('word').doNothing())
    .returning('id')
    .executeTakeFirst();
  return inserted !== undefined;
}

export async function deleteBlockedWord(db: Kysely<Database>, id: number): Promise<string | null> {
  const deleted = await db
    .deleteFrom('blocked_words')
    .where('id', '=', id)
    .returning('word')
    .executeTakeFirst();
  return deleted?.word ?? null;
}

/**
 * Recompute and persist `puzzles.max_score` and `puzzles.computed_data` ONLY for active
 * puzzles whose `(letters, center)` can form the newly blocked or unblocked word.
 */
export async function recomputeAffectedPuzzlesForWord(
  db: Kysely<Database>,
  rawWord: string,
): Promise<number> {
  const normWord = normalizeWord(rawWord);
  if (normWord.length < MIN_WORD_LENGTH) return 0;

  const activePuzzles = await getAllActivePuzzles(db);
  const affected = activePuzzles.filter((p) => {
    const centerChar = p.center.trim().toLowerCase();
    if (!normWord.includes(centerChar)) return false;
    const letterSet = new Set(normalizeLettersKey(p.letters));
    for (const ch of normWord) {
      if (!letterSet.has(ch)) return false;
    }
    return true;
  });

  if (affected.length === 0) return 0;

  const blockedWords = await getBlockedWords(db);
  let updated = 0;

  for (const p of affected) {
    const computed = computePuzzle(p.letters, p.center, blockedWords);
    const computedJson = JSON.stringify(computed);
    await db
      .updateTable('puzzles')
      .set({
        max_score: computed.max_score,
        computed_data: computedJson,
        updated_at: new Date().toISOString(),
      })
      .where('slot', '=', p.slot)
      .execute();
    updated += 1;
  }

  return updated;
}

/**
 * Assemble the N-day admin schedule directly from `puzzles.computed_data` in 2 parallel DB queries,
 * falling back to `computePuzzle` only for legacy rows with `computed_data = NULL`.
 */
export async function buildAdminSchedule(
  db: Kysely<Database>,
  startDateStr: string,
  days: number,
  todayStr: string,
) {
  const [activePuzzles, epochDate] = await Promise.all([getAllActivePuzzles(db), getEpochDate(db)]);
  let blockedWords: string[] | null = null;

  const activeSlots = activePuzzles.map((p) => Number(p.slot));
  const puzzleBySlot = new Map(activePuzzles.map((p) => [Number(p.slot), p]));
  const displayNumberBySlot = new Map(activeSlots.map((slot, index) => [slot, index + 1]));
  const computedBySlot = new Map<
    number,
    { letters: string[]; center: string; wordCount: number; maxScore: number; pangramCount: number }
  >();

  const startDate = new Date(`${startDateStr}T00:00:00Z`);
  const schedule = [];

  for (let d = 0; d < days; d++) {
    const curDate = new Date(startDate.getTime() + d * 86_400_000);
    const dateKey = curDate.toISOString().slice(0, 10);
    const slot = computePuzzleSlotForDate(activeSlots, epochDate, curDate);

    let letters: string[] | null = null;
    let center: string | null = null;
    let wordCount = 0;
    let maxScore = 0;
    let pangramCount = 0;

    if (slot !== null) {
      let stats = computedBySlot.get(slot);
      if (!stats) {
        const puzzle = puzzleBySlot.get(slot);
        if (puzzle) {
          const parsedLetters = puzzle.letters.split(',').map((l) => l.trim());
          const precomputed = parseComputedPuzzleData(puzzle.computed_data);
          if (precomputed) {
            stats = {
              letters: parsedLetters,
              center: puzzle.center,
              wordCount: precomputed.hint_data.word_count,
              maxScore: precomputed.max_score,
              pangramCount: precomputed.hint_data.pangram_count,
            };
          } else {
            if (blockedWords === null) {
              blockedWords = await getBlockedWords(db);
            }
            const computed = computePuzzle(parsedLetters, puzzle.center, blockedWords);
            stats = {
              letters: parsedLetters,
              center: puzzle.center,
              wordCount: computed.hint_data.word_count,
              maxScore: computed.max_score,
              pangramCount: computed.hint_data.pangram_count,
            };
          }
          computedBySlot.set(slot, stats);
        }
      }

      if (stats) {
        letters = stats.letters;
        center = stats.center;
        wordCount = stats.wordCount;
        maxScore = stats.maxScore;
        pangramCount = stats.pangramCount;
      }
    }

    const dispNum = slot !== null ? (displayNumberBySlot.get(slot) ?? null) : null;

    schedule.push({
      date: dateKey,
      slot: slot ?? 0,
      display_number: dispNum ?? (slot !== null ? slot : 1),
      letters,
      center,
      word_count: wordCount,
      max_score: maxScore,
      pangram_count: pangramCount,
      is_today: dateKey === todayStr,
    });
  }

  return {
    start: startDateStr,
    days,
    schedule,
    total_puzzles: activeSlots.length,
  };
}
