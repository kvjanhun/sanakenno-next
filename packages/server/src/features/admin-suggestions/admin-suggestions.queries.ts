import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { normalizeLettersKey, suggestionKey } from './suggestion-scorer.js';

export interface CombinationFilterOptions {
  requires?: string;
  excludes?: string;
  min_pangrams?: number;
  max_pangrams?: number;
  min_words?: number;
  max_words?: number;
  in_rotation?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export async function getCombinations(
  db: Kysely<Database>,
  options: CombinationFilterOptions = {},
): Promise<{
  rows: Array<{
    letters: string;
    total_pangrams: number;
    min_word_count: number;
    max_word_count: number;
    min_max_score: number;
    max_max_score: number;
    variations: string;
    in_rotation: number;
  }>;
  total: number;
}> {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(200, Math.max(1, options.per_page ?? 50));
  const offset = (page - 1) * perPage;

  let query = db.selectFrom('combinations');

  if (options.requires) {
    for (const ch of options.requires.toLowerCase().trim()) {
      if (/[a-zåäö]/.test(ch)) {
        query = query.where('letters', 'like', `%${ch}%`);
      }
    }
  }

  if (options.excludes) {
    for (const ch of options.excludes.toLowerCase().trim()) {
      if (/[a-zåäö]/.test(ch)) {
        query = query.where('letters', 'not like', `%${ch}%`);
      }
    }
  }

  if (typeof options.min_pangrams === 'number') {
    query = query.where('total_pangrams', '>=', options.min_pangrams);
  }
  if (typeof options.max_pangrams === 'number') {
    query = query.where('total_pangrams', '<=', options.max_pangrams);
  }
  if (typeof options.min_words === 'number') {
    query = query.where('max_word_count', '>=', options.min_words);
  }
  if (typeof options.max_words === 'number') {
    query = query.where('min_word_count', '<=', options.max_words);
  }
  if (typeof options.in_rotation === 'number') {
    query = query.where('in_rotation', '=', options.in_rotation);
  }

  const countRow = await query
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  const total = Number(countRow.count);

  let sortCol:
    | 'letters'
    | 'total_pangrams'
    | 'min_word_count'
    | 'max_word_count'
    | 'min_max_score'
    | 'max_max_score' = 'letters';
  if (
    options.sort &&
    [
      'letters',
      'total_pangrams',
      'min_word_count',
      'max_word_count',
      'min_max_score',
      'max_max_score',
    ].includes(options.sort)
  ) {
    sortCol = options.sort as typeof sortCol;
  }

  const orderDir = options.order === 'asc' ? 'asc' : 'desc';

  const rows = await query
    .selectAll()
    .orderBy(sortCol, orderDir)
    .limit(perPage)
    .offset(offset)
    .execute();

  return { rows, total };
}

export async function getCombinationCandidateRows(
  db: Kysely<Database>,
  minWords: number,
  maxWords: number,
  maxPangrams = 5,
) {
  return db
    .selectFrom('combinations')
    .selectAll()
    .where('max_word_count', '>=', minWords)
    .where('min_word_count', '<=', maxWords)
    .where('total_pangrams', '>=', 1)
    .where('total_pangrams', '<=', maxPangrams)
    .orderBy('max_word_count', 'asc')
    .execute();
}

export async function getUsedLettersKeys(db: Kysely<Database>): Promise<Set<string>> {
  const rows = await db.selectFrom('puzzles').select('letters').execute();
  return new Set(rows.map((r) => normalizeLettersKey(r.letters)));
}

export async function getRecentPuzzles(
  db: Kysely<Database>,
  limit = 7,
): Promise<Array<{ slot: number; letters: string; center: string }>> {
  const rows = await db
    .selectFrom('puzzles')
    .select(['slot', 'letters', 'center'])
    .orderBy('slot', 'desc')
    .limit(limit)
    .execute();
  return rows.map((r) => ({ slot: Number(r.slot), letters: r.letters, center: r.center }));
}

export async function getSuggestionRejections(db: Kysely<Database>) {
  return db
    .selectFrom('suggestion_rejections')
    .selectAll()
    .orderBy('rejected_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
}

export async function persistedSuggestionRejectionKeys(db: Kysely<Database>): Promise<string[]> {
  const rows = await db
    .selectFrom('suggestion_rejections')
    .select(['letters_key', 'center'])
    .execute();
  return rows.map((r) => suggestionKey(r.letters_key, r.center));
}

export async function getSuggestionRejectionById(db: Kysely<Database>, id: number) {
  return db.selectFrom('suggestion_rejections').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function insertSuggestionRejection(
  db: Kysely<Database>,
  lettersKey: string,
  center: string,
) {
  await db
    .insertInto('suggestion_rejections')
    .values({
      letters_key: lettersKey,
      center,
    })
    .onConflict((oc) => oc.columns(['letters_key', 'center']).doNothing())
    .execute();

  return db
    .selectFrom('suggestion_rejections')
    .selectAll()
    .where('letters_key', '=', lettersKey)
    .where('center', '=', center)
    .executeTakeFirstOrThrow();
}

export async function deleteSuggestionRejection(
  db: Kysely<Database>,
  id: number,
): Promise<boolean> {
  const res = await db.deleteFrom('suggestion_rejections').where('id', '=', id).executeTakeFirst();
  return Number(res.numDeletedRows) > 0;
}
