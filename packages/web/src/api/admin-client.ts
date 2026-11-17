import type { VariationData } from '@sanakenno/shared';
import { apiClient } from './client.js';

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

export async function adminCheckSession(): Promise<{ username: string; csrfToken: string } | null> {
  const res = await apiClient.api.auth.session.$get();
  if (!res.ok) return null;
  const data = (await res.json()) as { username: string; csrfToken: string };
  return data;
}

export async function adminLogin(payload: {
  username: string;
  password: string;
}): Promise<{ username: string; csrfToken: string }> {
  const res = await apiClient.api.auth.login.$post({ json: payload });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Kirjautuminen epäonnistui'));
  }
  return (await res.json()) as { username: string; csrfToken: string };
}

export async function adminLogout(): Promise<void> {
  await apiClient.api.auth.logout.$post().catch(() => undefined);
}

export async function adminSavePuzzle(
  csrfToken: string,
  payload: { slot?: number; letters: string | string[]; center: string; force?: boolean },
) {
  const res = await apiClient.api.admin.puzzle.$post(
    { json: payload },
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
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
  const res = await apiClient.api.admin.puzzle[':slot'].$delete(
    { param: { slot: String(slot) } },
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Poisto epäonnistui'));
  return res.json();
}

export async function adminSwapPuzzles(csrfToken: string, slotA: number, slotB: number) {
  const res = await apiClient.api.admin.puzzle.swap.$post(
    { json: { slotA, slotB } },
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Vaihto epäonnistui'));
  return res.json();
}

export async function adminGetSlots(csrfToken: string) {
  const res = await apiClient.api.admin.puzzle.slots.$get(
    {},
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
  );
  if (!res.ok) {
    return { slots: [], active_slots: [] as number[], total_puzzles: 0, today_slot: null };
  }
  return (await res.json()) as {
    slots: Array<{ slot: number; display_number: number }>;
    active_slots?: number[];
    total_puzzles: number;
    today_slot?: number | null;
  };
}

export async function adminGetPuzzleVariations(
  csrfToken: string,
  params: { slot?: number; display_number?: number; letters?: string },
) {
  const query: { slot?: string; display_number?: string; letters?: string } = {};
  if (params.slot !== undefined) query.slot = String(params.slot);
  if (params.display_number !== undefined) query.display_number = String(params.display_number);
  if (params.letters !== undefined) query.letters = params.letters;
  const res = await apiClient.api.admin.puzzle.variations.$get(
    { query },
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Pelin lataus epäonnistui'));
  return (await res.json()) as {
    slot: number;
    display_number: number | null;
    total_puzzles: number;
    prev_slot: number | null;
    next_slot: number | null;
    letters: string[];
    center: string;
    variations: VariationData[];
    is_active: boolean;
  };
}

export async function adminChangeCenter(csrfToken: string, slot: number, center: string) {
  const res = await apiClient.api.admin.puzzle.center.$post(
    { json: { slot, center } },
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Keskuksen vaihto epäonnistui'));
  return res.json();
}

export async function adminPreview(
  csrfToken: string,
  payload: { letters: string | string[]; center: string },
) {
  const res = await apiClient.api.admin.preview.$post(
    { json: payload },
    { headers: csrfHeaders(csrfToken), init: { credentials: 'same-origin' } },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Esikatselu epäonnistui'));
  return (await res.json()) as {
    words: string[];
    max_score: number;
    word_count: number;
    pangram_count: number;
    hint_data: { word_count: number; pangram_count: number };
    variations: VariationData[];
  };
}

export async function adminGetBlocked(csrfToken: string) {
  const res = await apiClient.api.admin.blocked.$get({}, { headers: csrfHeaders(csrfToken) });
  if (!res.ok) return { blocked: [] };
  return (await res.json()) as { blocked: Array<{ id: number; word: string; blocked_at: string }> };
}

export async function adminBlockWord(csrfToken: string, word: string) {
  const res = await apiClient.api.admin.block.$post(
    { json: { word } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Sanan esto epäonnistui'));
  }
  return res.json();
}

export async function adminUnblockWord(csrfToken: string, id: number) {
  const res = await apiClient.api.admin.block[':id'].$delete(
    { param: { id: String(id) } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Eston poisto epäonnistui'));
  }
  return res.json();
}

export async function adminGetSchedule(csrfToken: string, days = 14) {
  const res = await apiClient.api.admin.schedule.$get(
    { query: { days: String(days) } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) return { schedule: [] };
  return (await res.json()) as {
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
  };
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
  const res = await apiClient.api.admin.combinations.$get(
    { query },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Yhdistelmien haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetSuggestion(
  csrfToken: string,
  params: {
    declined?: string[];
    min_words?: number;
    max_words?: number;
  } = {},
) {
  const query: { declined?: string; min_words?: string; max_words?: string } = {};
  if (params.declined?.length) query.declined = params.declined.join(',');
  if (params.min_words !== undefined) query.min_words = String(params.min_words);
  if (params.max_words !== undefined) query.max_words = String(params.max_words);
  const res = await apiClient.api.admin.suggestion.$get(
    { query },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Ehdotuksen haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetSuggestionRejections(csrfToken: string) {
  const res = await apiClient.api.admin['suggestion-rejections'].$get(
    {},
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) return { rejections: [] };
  return res.json();
}

export async function adminRejectSuggestion(
  csrfToken: string,
  letters: string | string[],
  center: string,
) {
  const res = await apiClient.api.admin['suggestion-rejections'].$post(
    { json: { letters, center } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Ehdotuksen hylkäys epäonnistui'));
  }
  return res.json();
}

export async function adminDeleteSuggestionRejection(csrfToken: string, id: number) {
  const res = await apiClient.api.admin['suggestion-rejections'][':id'].$delete(
    { param: { id: String(id) } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Hylkäyksen peruminen epäonnistui'));
  }
  return res.json();
}

export async function adminGetAchievements(
  csrfToken: string,
  days = 7,
  mode: 'users' | 'all' = 'all',
) {
  const res = await apiClient.api.admin.achievements.$get(
    { query: { days: String(days), mode } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Saavutustilastojen haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetFailedGuesses(csrfToken: string, days = 7) {
  const res = await apiClient.api.admin['failed-guesses'].$get(
    { query: { days: String(days) } },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Virhearvausten haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetWordFinds(
  csrfToken: string,
  params: { puzzle_number?: number; display_number?: number },
) {
  const query: { puzzle_number?: string; display_number?: string } = {};
  if (params.display_number !== undefined) query.display_number = String(params.display_number);
  else if (params.puzzle_number !== undefined) query.puzzle_number = String(params.puzzle_number);

  const res = await apiClient.api.admin['word-finds'].$get(
    { query },
    { headers: csrfHeaders(csrfToken) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Sanalöytöjen haku epäonnistui'));
  }
  return res.json();
}
