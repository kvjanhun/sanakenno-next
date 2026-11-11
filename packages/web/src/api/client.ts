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
  TransferTicketResponse,
  TransferUseResponse,
  WordFindPayload,
} from '@sanakenno/shared';

export * from './admin-client.js';

/**
 * Single typed Hono RPC client for @sanakenno/web.
 * Direct fetch() calls outside src/api/ are forbidden by tests/architecture.test.ts.
 */
export const apiClient = hc<AppType>('/');

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function optionalAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('sanakenno_auth_token');
    if (!raw) return {};
    const token = JSON.parse(raw);
    if (typeof token === 'string' && token.length > 0) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Ignore storage parse issues
  }
  return {};
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

export async function postPlayerTransferTicket(token: string): Promise<TransferTicketResponse> {
  const res = await fetch('/api/player/auth/transfer/ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Koodin luominen epäonnistui'));
  }
  return (await res.json()) as TransferTicketResponse;
}

export async function postPlayerTransferCreate(
  token: string,
  payload: { email: string; player_key?: string },
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

export async function postPlayerTransferUse(
  payload: {
    token: string;
    stats?: PlayerStats;
    puzzle_states?: SyncPuzzleState[];
  },
  currentToken?: string | null,
): Promise<TransferUseResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
  const res = await fetch('/api/player/auth/transfer/use', {
    method: 'POST',
    headers,
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
    keepalive: true,
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
    headers: { 'Content-Type': 'application/json', ...optionalAuthHeaders() },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function postFailedGuess(payload: FailedGuessPayload): void {
  void fetch('/api/failed-guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...optionalAuthHeaders() },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function postWordFind(payload: WordFindPayload): void {
  void fetch('/api/word-find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...optionalAuthHeaders() },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
