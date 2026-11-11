import {
  type StatsRecord,
  type SyncProgressPayload,
  type SyncPuzzleState,
  type TransferTicketResponse,
} from '@sanakenno/shared';
import { create } from 'zustand';
import {
  fetchPlayerMe,
  fetchPlayerSync,
  postPlayerAuthInit,
  postPlayerLogout,
  postPlayerRotate,
  postPlayerTransferCreate,
  postPlayerTransferTicket,
  postPlayerTransferUse,
  postSyncPreferences,
  postSyncProgress,
  postSyncState,
  postSyncStats,
} from '../../api/client.js';
import {
  getRawStorage,
  loadFromStorage,
  removeFromStorage,
  saveToStorage,
  STATS_STORAGE_KEY,
} from '../gameplay/storage.js';
import {
  AUTH_TOKEN_STORAGE_KEY,
  buildLocalPreferences,
  gatherLocalData,
  LINKED_STATE_STORAGE_KEY,
  PLAYER_KEY_STORAGE_KEY,
  pullAndMergeData,
  pushLocalDataAheadOfServer,
} from './sync-reconcile.js';

export interface AuthState {
  isLoggedIn: boolean;
  playerId: number | null;
  playerKey: string | null;
  isLinked: boolean;
  sessionCount: number;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refreshSessionCount: () => Promise<void>;
  initPlayer: () => Promise<void>;
  revealShareOptions: () => void;
  sendTransferEmail: (email: string) => Promise<void>;
  useTransfer: (token: string) => Promise<void>;
  rotatePlayerKey: () => Promise<void>;
  clearError: () => void;
  logout: (options?: { clearLocalProgress?: boolean }) => Promise<void>;
  syncStatsRecord: (record: StatsRecord) => Promise<void>;
  syncPuzzleState: (state: SyncPuzzleState) => Promise<void>;
  syncProgress: (payload: SyncProgressPayload) => Promise<void>;
  syncProgressDebounced: (payload: SyncProgressPayload) => void;
  flushPendingSync: () => Promise<void>;
  requestTransferTicket: () => Promise<TransferTicketResponse>;
  syncPreferences: () => Promise<void>;
}

const pendingSyncQueue = new Map<number, SyncProgressPayload>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY_MS = 1500;

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  playerId: null,
  playerKey: null,
  isLinked: false,
  sessionCount: 1,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  revealShareOptions: () => {
    saveToStorage(LINKED_STATE_STORAGE_KEY, 'true');
    set({ isLinked: true });
  },

  initialize: async () => {
    if (typeof window === 'undefined') return;
    const storedToken = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    const storedPlayerKey = loadFromStorage<string>(PLAYER_KEY_STORAGE_KEY);
    const storedIsLinked = getRawStorage(LINKED_STATE_STORAGE_KEY) === 'true';

    if (!storedToken) {
      await get().initPlayer();
      return;
    }

    set({ isLoading: true, isLinked: storedIsLinked, playerKey: storedPlayerKey });
    try {
      const me = await fetchPlayerMe(storedToken);
      if (!me) {
        // Expired session -> re-init
        await get().initPlayer();
        return;
      }

      const sessionCount = me.session_count ?? 1;
      const isLinked = sessionCount > 1;
      if (isLinked) {
        saveToStorage(LINKED_STATE_STORAGE_KEY, 'true');
      } else {
        removeFromStorage(LINKED_STATE_STORAGE_KEY);
      }

      set({
        isLoggedIn: true,
        playerId: me.player_id,
        sessionCount,
        isLinked,
        isLoading: false,
      });

      // Background pull & merge
      const syncData = await fetchPlayerSync(storedToken);
      if (syncData) {
        const localBefore = gatherLocalData();
        const changed = pullAndMergeData(syncData, () => void get().syncPreferences());
        pushLocalDataAheadOfServer(localBefore, syncData, {
          syncStatsRecord: (rec) => get().syncStatsRecord(rec),
          syncPuzzleState: (st) => get().syncPuzzleState(st),
        });
        if (changed && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sanakenno:sync-reload'));
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  initPlayer: async () => {
    set({ isLoading: true, error: null });
    try {
      const { player_key, token, player_id } = await postPlayerAuthInit();
      saveToStorage(AUTH_TOKEN_STORAGE_KEY, token);
      saveToStorage(PLAYER_KEY_STORAGE_KEY, player_key);

      set({
        isLoggedIn: true,
        playerId: player_id,
        playerKey: player_key,
        sessionCount: 1,
        isLinked: false,
        isLoading: false,
      });

      // Upload local data to initialize the player on server
      const local = gatherLocalData();
      if (local.stats.records.length > 0 || local.puzzle_states.length > 0) {
        const res = await postPlayerTransferUse(
          {
            token: player_key,
            stats: local.stats,
            puzzle_states: local.puzzle_states,
          },
          token,
        ).catch(() => undefined);
        if (res?.token) {
          saveToStorage(AUTH_TOKEN_STORAGE_KEY, res.token);
        }
      }
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Alustus epäonnistui',
      });
    }
  },

  refreshSessionCount: async () => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    try {
      const me = await fetchPlayerMe(token);
      if (me) {
        const count = me.session_count ?? 1;
        if (count > 1) {
          saveToStorage(LINKED_STATE_STORAGE_KEY, 'true');
        } else {
          removeFromStorage(LINKED_STATE_STORAGE_KEY);
        }
        set({ sessionCount: count, isLinked: count > 1 });
      }
    } catch {
      // ignore network errors
    }
  },

  sendTransferEmail: async (email: string) => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    const playerKey = get().playerKey;
    if (!token) {
      set({ error: 'Kirjautuminen puuttuu' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      await postPlayerTransferCreate(token, { email, player_key: playerKey ?? undefined });
      get().revealShareOptions();
      set({ isLoading: false });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sähköpostin lähetys epäonnistui',
      });
    }
  },

  useTransfer: async (token: string) => {
    if (get().playerKey === token) {
      await get().refreshSessionCount();
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const currentToken = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
      const local = gatherLocalData();
      const res = await postPlayerTransferUse(
        {
          token,
          stats: local.stats,
          puzzle_states: local.puzzle_states,
        },
        currentToken,
      );

      saveToStorage(AUTH_TOKEN_STORAGE_KEY, res.token);
      saveToStorage(PLAYER_KEY_STORAGE_KEY, token);
      const count = res.session_count ?? 1;
      if (count > 1) {
        saveToStorage(LINKED_STATE_STORAGE_KEY, 'true');
      } else {
        removeFromStorage(LINKED_STATE_STORAGE_KEY);
      }

      set({
        isLoggedIn: true,
        playerId: res.player_id,
        playerKey: token,
        sessionCount: count,
        isLinked: count > 1,
        isLoading: false,
      });

      pullAndMergeData(res, () => void get().syncPreferences());
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sanakenno:sync-reload'));
      }
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Yhdistäminen epäonnistui',
      });
    }
  },

  rotatePlayerKey: async () => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;

    set({ isLoading: true, error: null });
    try {
      const { player_key } = await postPlayerRotate(token);
      saveToStorage(PLAYER_KEY_STORAGE_KEY, player_key);
      removeFromStorage(LINKED_STATE_STORAGE_KEY);
      set({ playerKey: player_key, sessionCount: 1, isLinked: false, isLoading: false });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Tunnisteen vaihto epäonnistui',
      });
    }
  },

  logout: async (options?: { clearLocalProgress?: boolean }) => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (token) {
      await postPlayerLogout(token).catch(() => undefined);
    }
    removeFromStorage(AUTH_TOKEN_STORAGE_KEY);
    removeFromStorage(PLAYER_KEY_STORAGE_KEY);
    removeFromStorage(LINKED_STATE_STORAGE_KEY);

    if (options?.clearLocalProgress) {
      removeFromStorage(STATS_STORAGE_KEY);
      if (typeof window !== 'undefined') {
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (
              key &&
              (key.startsWith('sanakenno_state_') ||
                key.startsWith('revealed_') ||
                key === 'sanakenno_state')
            ) {
              keysToRemove.push(key);
            }
          }
          for (const key of keysToRemove) {
            window.localStorage.removeItem(key);
          }
        } catch {
          // ignore quota/storage issues
        }
      }
    }

    set({
      isLoggedIn: false,
      playerId: null,
      playerKey: null,
      sessionCount: 1,
      isLinked: false,
    });
    // Create fresh player identity
    await get().initPlayer();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sanakenno:sync-reload'));
    }
  },

  syncStatsRecord: async (record: StatsRecord) => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    await postSyncStats(token, record);
  },

  syncPuzzleState: async (state: SyncPuzzleState) => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    await postSyncState(token, state);
  },

  syncProgress: async (payload: SyncProgressPayload) => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    await postSyncProgress(token, payload);
  },

  syncProgressDebounced: (payload: SyncProgressPayload) => {
    pendingSyncQueue.set(payload.puzzle_number, payload);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void get().flushPendingSync();
    }, DEBOUNCE_DELAY_MS);
  },

  flushPendingSync: async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingSyncQueue.size === 0) return;
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;

    const entries = Array.from(pendingSyncQueue.entries());
    for (const [slot, payload] of entries) {
      try {
        await postSyncProgress(token, payload);
        pendingSyncQueue.delete(slot);
      } catch {
        // Keep in queue for next flush attempt
      }
    }
  },

  requestTransferTicket: async () => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) throw new Error('Kirjautuminen puuttuu');
    return await postPlayerTransferTicket(token);
  },

  syncPreferences: async () => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    const prefs = buildLocalPreferences();
    await postSyncPreferences(token, prefs);
  },
}));

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void useAuthStore.getState().flushPendingSync();
    }
  });

  window.addEventListener('pagehide', () => {
    void useAuthStore.getState().flushPendingSync();
  });

  window.addEventListener('beforeunload', () => {
    void useAuthStore.getState().flushPendingSync();
  });
}
