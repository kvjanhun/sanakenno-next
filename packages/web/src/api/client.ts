import { hc } from 'hono/client';
import type { AppType } from '@sanakenno/server/app';
import type {
  AchievementPayload,
  FailedGuessPayload,
  PlayerAuthInitResponse,
  PlayerAuthRotateResponse,
  PlayerMeResponse,
  PlayerPreferences,
  PlayerStats,
  StatsRecord,
  SyncPayload,
  SyncProgressPayload,
  SyncPuzzleState,
  TransferUseResponse,
  WordFindPayload,
} from '@sanakenno/shared';

/**
 * Single typed Hono RPC client for @sanakenno/web.
 * Direct fetch() calls outside src/api/ are forbidden by tests/architecture.test.ts.
 */
export const apiClient = hc<AppType>('/');

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function fetchPlayerMe(token: string): Promise<PlayerMeResponse | null> {
  const res = await apiClient.api.player.me.$get({}, { headers: authHeaders(token) });
  if (!res.ok) return null;
  return (await res.json()) as PlayerMeResponse;
}

export async function fetchPlayerSync(token: string): Promise<SyncPayload | null> {
  const res = await apiClient.api.player.sync.$get({}, { headers: authHeaders(token) });
  if (!res.ok) return null;
  return (await res.json()) as SyncPayload;
}

export async function postPlayerAuthInit(): Promise<PlayerAuthInitResponse> {
  const res = await apiClient.api.player.auth.init.$post();
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Alustus epäonnistui'));
  }
  return (await res.json()) as PlayerAuthInitResponse;
}

export async function postPlayerTransferCreate(
  token: string,
  payload: { email: string; player_key: string },
): Promise<void> {
  const res = await fetch('/api/player/auth/transfer/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Sähköpostin lähetys epäonnistui'));
  }
}

export async function postPlayerTransferUse(payload: {
  token: string;
  stats: PlayerStats;
  puzzle_states: SyncPuzzleState[];
}): Promise<TransferUseResponse> {
  const res = await fetch('/api/player/auth/transfer/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Yhdistäminen epäonnistui'));
  }
  return (await res.json()) as TransferUseResponse;
}

export async function postPlayerRotate(token: string): Promise<PlayerAuthRotateResponse> {
  const res = await apiClient.api.player.auth.rotate.$post({}, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Tunnisteen vaihto epäonnistui'));
  }
  return (await res.json()) as PlayerAuthRotateResponse;
}

export async function postPlayerLogout(token: string): Promise<void> {
  await apiClient.api.player.auth.logout
    .$post({}, { headers: authHeaders(token) })
    .catch(() => undefined);
}

export async function postSyncStats(token: string, record: StatsRecord): Promise<void> {
  await fetch('/api/player/sync/stats', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(record),
  }).catch(() => undefined);
}

export async function postSyncState(token: string, state: SyncPuzzleState): Promise<void> {
  await fetch('/api/player/sync/state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(state),
  }).catch(() => undefined);
}

export async function postSyncProgress(token: string, payload: SyncProgressPayload): Promise<void> {
  await fetch('/api/player/sync/progress', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export async function postSyncPreferences(token: string, prefs: PlayerPreferences): Promise<void> {
  await fetch('/api/player/sync/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify(prefs),
  }).catch(() => undefined);
}

export function postAchievement(payload: AchievementPayload): void {
  void fetch('/api/achievement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function postFailedGuess(payload: FailedGuessPayload): void {
  void fetch('/api/failed-guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function postWordFind(payload: WordFindPayload): void {
  void fetch('/api/word-find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

function csrfHeaders(token: string): Record<string, string> {
  return {
    'X-CSRF-Token': token,
  };
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
  payload: { slot?: number; letters: string; center: string; force?: boolean },
) {
  const res = await fetch('/api/admin/puzzle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(csrfToken),
    },
    body: JSON.stringify(payload),
  });
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
  const res = await fetch(`/api/admin/puzzle/${slot}`, {
    method: 'DELETE',
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Poisto epäonnistui'));
  }
  return res.json();
}

export async function adminSwapPuzzles(csrfToken: string, slotA: number, slotB: number) {
  const res = await fetch('/api/admin/puzzle/swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(csrfToken),
    },
    body: JSON.stringify({ slotA, slotB }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Vaihto epäonnistui'));
  }
  return res.json();
}

export async function adminGetSlots(csrfToken: string) {
  const res = await fetch('/api/admin/puzzle/slots', {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) return { slots: [] };
  return (await res.json()) as { slots: Array<{ slot: number; display_number: number }> };
}

export async function adminPreview(
  csrfToken: string,
  payload: { letters: string; center: string },
) {
  const res = await fetch('/api/admin/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(csrfToken),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Esikatselu epäonnistui'));
  }
  return res.json();
}

export async function adminGetBlocked(csrfToken: string) {
  const res = await fetch('/api/admin/blocked', {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) return { blocked: [] };
  return (await res.json()) as { blocked: Array<{ id: number; word: string; blocked_at: string }> };
}

export async function adminBlockWord(csrfToken: string, word: string) {
  const res = await fetch('/api/admin/block', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(csrfToken),
    },
    body: JSON.stringify({ word }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Sanan esto epäonnistui'));
  }
  return res.json();
}

export async function adminUnblockWord(csrfToken: string, id: number) {
  const res = await fetch(`/api/admin/block/${id}`, {
    method: 'DELETE',
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Eston poisto epäonnistui'));
  }
  return res.json();
}

export async function adminGetSchedule(csrfToken: string, days = 14) {
  const res = await fetch(`/api/admin/schedule?days=${days}`, {
    headers: csrfHeaders(csrfToken),
  });
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
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const qs = sp.toString();
  const url = `/api/admin/combinations${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: csrfHeaders(csrfToken),
  });
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
    include_pangrams?: boolean;
  } = {},
) {
  const sp = new URLSearchParams();
  if (params.declined?.length) sp.set('declined', params.declined.join(','));
  if (params.min_words) sp.set('min_words', String(params.min_words));
  if (params.max_words) sp.set('max_words', String(params.max_words));
  if (params.include_pangrams) sp.set('include_pangrams', 'true');
  const qs = sp.toString();
  const url = `/api/admin/suggestion${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Ehdotuksen haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetSuggestionRejections(csrfToken: string) {
  const res = await fetch('/api/admin/suggestion-rejections', {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) return { rejections: [] };
  return res.json();
}

export async function adminRejectSuggestion(
  csrfToken: string,
  letters: string | string[],
  center: string,
) {
  const res = await fetch('/api/admin/suggestion-rejections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(csrfToken),
    },
    body: JSON.stringify({ letters, center }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Ehdotuksen hylkäys epäonnistui'));
  }
  return res.json();
}

export async function adminDeleteSuggestionRejection(csrfToken: string, id: number) {
  const res = await fetch(`/api/admin/suggestion-rejections/${id}`, {
    method: 'DELETE',
    headers: csrfHeaders(csrfToken),
  });
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
  const res = await fetch(`/api/admin/achievements?days=${days}&mode=${mode}`, {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Saavutustilastojen haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetFailedGuesses(csrfToken: string, days = 7) {
  const res = await fetch(`/api/admin/failed-guesses?days=${days}`, {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Virhearvausten haku epäonnistui'));
  }
  return res.json();
}

export async function adminGetWordFinds(
  csrfToken: string,
  params: { puzzle_number?: number; display_number?: number },
) {
  const sp = new URLSearchParams();
  if (params.display_number !== undefined) sp.set('display_number', String(params.display_number));
  else if (params.puzzle_number !== undefined)
    sp.set('puzzle_number', String(params.puzzle_number));

  const res = await fetch(`/api/admin/word-finds?${sp.toString()}`, {
    headers: csrfHeaders(csrfToken),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Sanalöytöjen haku epäonnistui'));
  }
  return res.json();
}
