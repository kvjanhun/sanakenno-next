import { hc } from 'hono/client';
import type { AppType } from '@sanakenno/server/app';
import {
  AUTH_TOKEN_STORAGE_KEY,
  type AchievementPayload,
  type FailedGuessPayload,
  type PlayerAuthInitResponse,
  type PlayerAuthRotateResponse,
  type PlayerMeResponse,
  type PlayerPreferences,
  type PlayerStats,
  type SyncPayload,
  type SyncProgressPayload,
  type SyncPuzzleState,
  type TransferTicketResponse,
  type TransferUseResponse,
  type WordFindPayload,
} from '@sanakenno/shared';

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
    const raw = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
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

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
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

async function unwrapOptionalJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function assertOk(res: Response, fallback: string): Promise<void> {
  if (!res.ok) throw new Error(await readErrorMessage(res, fallback));
}

export async function fetchPlayerMe(token: string): Promise<PlayerMeResponse | null> {
  return unwrapOptionalJson<PlayerMeResponse>(
    await apiClient.api.player.me.$get({}, { headers: authHeaders(token) }),
  );
}

export async function fetchPlayerSync(token: string): Promise<SyncPayload | null> {
  return unwrapOptionalJson<SyncPayload>(
    await apiClient.api.player.sync.$get({}, { headers: authHeaders(token) }),
  );
}

export async function postPlayerAuthInit(): Promise<PlayerAuthInitResponse> {
  return unwrapJson<PlayerAuthInitResponse>(
    await apiClient.api.player.auth.init.$post(),
    'Alustus epäonnistui',
  );
}

export async function postPlayerTransferTicket(token: string): Promise<TransferTicketResponse> {
  return unwrapJson<TransferTicketResponse>(
    await apiClient.api.player.auth.transfer.ticket.$post({}, { headers: authHeaders(token) }),
    'Koodin luominen epäonnistui',
  );
}

export async function postPlayerTransferCreate(
  token: string,
  payload: { email: string; player_key?: string },
): Promise<void> {
  await assertOk(
    await apiClient.api.player.auth.transfer.create.$post(
      { json: payload },
      { headers: authHeaders(token) },
    ),
    'Sähköpostin lähetys epäonnistui',
  );
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
  return unwrapJson<TransferUseResponse>(
    await apiClient.api.player.auth.transfer.use.$post(
      { json: payload },
      Object.keys(headers).length > 0 ? { headers } : undefined,
    ),
    'Yhdistäminen epäonnistui',
  );
}

export async function postPlayerRotate(token: string): Promise<PlayerAuthRotateResponse> {
  return unwrapJson<PlayerAuthRotateResponse>(
    await apiClient.api.player.auth.rotate.$post({}, { headers: authHeaders(token) }),
    'Tunnisteen vaihto epäonnistui',
  );
}

export async function postPlayerLogout(token: string): Promise<void> {
  await apiClient.api.player.auth.logout
    .$post({}, { headers: authHeaders(token) })
    .catch(() => undefined);
}

export async function postSyncProgress(token: string, payload: SyncProgressPayload): Promise<void> {
  await assertOk(
    await apiClient.api.player.sync.progress.$post(
      { json: payload },
      {
        headers: authHeaders(token),
        init: { keepalive: true },
      },
    ),
    'Synkronointi epäonnistui',
  );
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
