import { hc } from 'hono/client';
import type { AppType } from '@sanakenno/server/app';
import type { VariationData } from '@sanakenno/shared';

const adminApiClient = hc<AppType>('/');

function csrfHeaders(token: string): Record<string, string> {
  return { 'X-CSRF-Token': token };
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function unwrapJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) throw new Error(await readErrorMessage(res, fallback));
  return (await res.json()) as T;
}

async function unwrapRpcJson<R extends { ok: boolean; json(): Promise<unknown> }>(
  res: R,
  fallback: string,
): Promise<Awaited<ReturnType<R['json']>>> {
  if (!res.ok) throw new Error(await readErrorMessage(res as unknown as Response, fallback));
  return (await res.json()) as Awaited<ReturnType<R['json']>>;
}

async function unwrapOptionalJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function adminCheckSession() {
  return unwrapOptionalJson<{ username: string; csrfToken: string }>(
    await adminApiClient.api.auth.session.$get(),
  );
}

export async function adminLogin(payload: { username: string; password: string }) {
  return unwrapJson<{ username: string; csrfToken: string }>(
    await adminApiClient.api.auth.login.$post({ json: payload }),
    'Kirjautuminen epäonnistui',
  );
}

export async function adminLogout(csrfToken?: string | null): Promise<void> {
  await adminApiClient.api.auth.logout
    .$post({}, { headers: csrfToken ? csrfHeaders(csrfToken) : undefined })
    .catch(() => undefined);
}

export async function adminSavePuzzle(
  csrfToken: string,
  payload: { slot?: number; letters: string | string[]; center: string; force?: boolean },
) {
  const res = await adminApiClient.api.admin.puzzle.$post(
    { json: payload },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      requires_force?: boolean;
    };
    const err = new Error(body.error ?? 'Pelin tallennus epäonnistui');
    (err as unknown as { requires_force?: boolean }).requires_force = body.requires_force;
    throw err;
  }
  return res.json();
}

export async function adminDeletePuzzle(csrfToken: string, slot: number) {
  return unwrapRpcJson(
    await adminApiClient.api.admin.puzzle[':slot'].$delete(
      { param: { slot: String(slot) } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Poisto epäonnistui',
  );
}

export async function adminSwapPuzzles(csrfToken: string, slotA: number, slotB: number) {
  return unwrapRpcJson(
    await adminApiClient.api.admin.puzzle.swap.$post(
      { json: { slotA, slotB } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Vaihto epäonnistui',
  );
}

export async function adminGetSlots(csrfToken: string) {
  const data = await unwrapOptionalJson<{
    slots: Array<{ slot: number; display_number: number }>;
    active_slots?: number[];
    total_puzzles: number;
    today_slot?: number | null;
  }>(await adminApiClient.api.admin.puzzle.slots.$get({}, { headers: csrfHeaders(csrfToken) }));
  return data ?? { slots: [], active_slots: [] as number[], total_puzzles: 0, today_slot: null };
}

export async function adminGetPuzzleVariations(
  csrfToken: string,
  params: { slot?: number; display_number?: number; letters?: string },
) {
  const query: { slot?: string; display_number?: string; letters?: string } = {};
  if (params.slot !== undefined) query.slot = String(params.slot);
  if (params.display_number !== undefined) query.display_number = String(params.display_number);
  if (params.letters !== undefined) query.letters = params.letters;
  return unwrapJson<{
    slot: number;
    display_number: number | null;
    total_puzzles: number;
    prev_slot: number | null;
    next_slot: number | null;
    letters: string[];
    center: string;
    variations: VariationData[];
    is_active: boolean;
  }>(
    await adminApiClient.api.admin.puzzle.variations.$get(
      { query },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Pelin lataus epäonnistui',
  );
}

export async function adminPreview(
  csrfToken: string,
  payload: { letters: string | string[]; center: string },
) {
  return unwrapJson<{
    words: string[];
    max_score: number;
    word_count: number;
    pangram_count: number;
    hint_data: { word_count: number; pangram_count: number };
    variations: VariationData[];
  }>(
    await adminApiClient.api.admin.preview.$post(
      { json: payload },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Esikatselu epäonnistui',
  );
}

export async function adminGetBlocked(csrfToken: string) {
  return unwrapJson<{ blocked: Array<{ id: number; word: string; blocked_at: string }> }>(
    await adminApiClient.api.admin.blocked.$get({}, { headers: csrfHeaders(csrfToken) }),
    'Estettyjen sanojen haku epäonnistui',
  );
}

export async function adminBlockWord(csrfToken: string, word: string) {
  return unwrapRpcJson(
    await adminApiClient.api.admin.block.$post(
      { json: { word } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Sanan esto epäonnistui',
  );
}

export async function adminUnblockWord(csrfToken: string, id: number) {
  return unwrapRpcJson(
    await adminApiClient.api.admin.block[':id'].$delete(
      { param: { id: String(id) } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Eston poisto epäonnistui',
  );
}

export async function adminGetSchedule(csrfToken: string, days = 14) {
  return unwrapJson<{
    schedule: Array<{
      date: string;
      slot: number;
      display_number: number;
      letters: string[] | null;
      center: string | null;
      word_count: number;
      max_score: number;
      pangram_count: number;
      is_today: boolean;
    }>;
  }>(
    await adminApiClient.api.admin.schedule.$get(
      { query: { days: String(days) } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Aikataulun haku epäonnistui',
  );
}

export async function adminGetCombinations(
  csrfToken: string,
  params: Record<string, string | number | undefined> = {},
) {
  const str = (v: string | number | undefined) =>
    v !== undefined && v !== '' ? String(v) : undefined;
  const query = {
    requires: str(params['requires']),
    excludes: str(params['excludes']),
    min_pangrams: str(params['min_pangrams']),
    max_pangrams: str(params['max_pangrams']),
    min_words: str(params['min_words']),
    max_words: str(params['max_words']),
    in_rotation: str(params['in_rotation']),
    sort: str(params['sort']),
    order: str(params['order']),
    page: str(params['page']),
    per_page: str(params['per_page']),
  };
  return unwrapRpcJson(
    await adminApiClient.api.admin.combinations.$get(
      { query },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Yhdistelmien haku epäonnistui',
  );
}

export async function adminGetSuggestion(
  csrfToken: string,
  params: { declined?: string[]; min_words?: number; max_words?: number } = {},
) {
  const query: { declined?: string; min_words?: string; max_words?: string } = {};
  if (params.declined?.length) query.declined = params.declined.join(',');
  if (params.min_words !== undefined) query.min_words = String(params.min_words);
  if (params.max_words !== undefined) query.max_words = String(params.max_words);
  return unwrapRpcJson(
    await adminApiClient.api.admin.suggestion.$get({ query }, { headers: csrfHeaders(csrfToken) }),
    'Ehdotuksen haku epäonnistui',
  );
}

export async function adminGetSuggestionRejections(csrfToken: string) {
  return unwrapRpcJson(
    await adminApiClient.api.admin['suggestion-rejections'].$get(
      {},
      { headers: csrfHeaders(csrfToken) },
    ),
    'Hylättyjen ehdotusten haku epäonnistui',
  );
}

export async function adminRejectSuggestion(
  csrfToken: string,
  letters: string | string[],
  center: string,
) {
  return unwrapRpcJson(
    await adminApiClient.api.admin['suggestion-rejections'].$post(
      { json: { letters, center } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Ehdotuksen hylkäys epäonnistui',
  );
}

export async function adminDeleteSuggestionRejection(csrfToken: string, id: number) {
  return unwrapRpcJson(
    await adminApiClient.api.admin['suggestion-rejections'][':id'].$delete(
      { param: { id: String(id) } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Hylkäyksen peruminen epäonnistui',
  );
}

export async function adminGetAchievements(
  csrfToken: string,
  days = 7,
  mode: 'users' | 'all' = 'all',
) {
  return unwrapRpcJson(
    await adminApiClient.api.admin.achievements.$get(
      { query: { days: String(days), mode } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Saavutustilastojen haku epäonnistui',
  );
}

export async function adminGetFailedGuesses(csrfToken: string, days = 7) {
  return unwrapRpcJson(
    await adminApiClient.api.admin['failed-guesses'].$get(
      { query: { days: String(days) } },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Virhearvausten haku epäonnistui',
  );
}

export async function adminGetWordFinds(
  csrfToken: string,
  params: { puzzle_number?: number; display_number?: number },
) {
  const query: { puzzle_number?: string; display_number?: string } = {};
  if (params.display_number !== undefined) query.display_number = String(params.display_number);
  else if (params.puzzle_number !== undefined) query.puzzle_number = String(params.puzzle_number);

  return unwrapRpcJson(
    await adminApiClient.api.admin['word-finds'].$get(
      { query },
      { headers: csrfHeaders(csrfToken) },
    ),
    'Sanalöytöjen haku epäonnistui',
  );
}
