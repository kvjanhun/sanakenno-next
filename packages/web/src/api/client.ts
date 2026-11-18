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
 * Direct HTTP calls must go through `apiClient`; raw `fetch` is forbidden by tests/architecture.test.ts.
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
  const res = await apiClient.api.player.auth.transfer.ticket.$post(
    {},
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Koodin luominen epäonnistui'));
  }
  return (await res.json()) as TransferTicketResponse;
}

export async function postPlayerTransferCreate(
  token: string,
  payload: { email: string; player_key?: string },
): Promise<void> {
  const res = await apiClient.api.player.auth.transfer.create.$post(
    { json: payload },
    { headers: authHeaders(token) },
  );
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
  const headers: Record<string, string> = {};
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
  const res = await apiClient.api.player.auth.transfer.use.$post(
    { json: payload },
    Object.keys(headers).length > 0 ? { headers } : undefined,
  );
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

export async function postSyncProgress(token: string, payload: SyncProgressPayload): Promise<void> {
  const res = await apiClient.api.player.sync.progress.$post(
    { json: payload },
    {
      headers: authHeaders(token),
      init: { keepalive: true },
    },
  );
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Synkronointi epäonnistui'));
  }
}

export async function postSyncPreferences(token: string, prefs: PlayerPreferences): Promise<void> {
  await apiClient.api.player.sync.preferences
    .$post({ json: prefs }, { headers: authHeaders(token) })
    .catch(() => undefined);
}

export function postAchievement(payload: AchievementPayload): void {
  void apiClient.api.achievement
    .$post({ json: payload }, { headers: optionalAuthHeaders() })
    .catch(() => undefined);
}

export function postFailedGuess(payload: FailedGuessPayload): void {
  void apiClient.api['failed-guess']
    .$post({ json: payload }, { headers: optionalAuthHeaders() })
    .catch(() => undefined);
}

export function postWordFind(payload: WordFindPayload): void {
  void apiClient.api['word-find']
    .$post({ json: payload }, { headers: optionalAuthHeaders() })
    .catch(() => undefined);
}
