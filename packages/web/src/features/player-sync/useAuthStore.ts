import {
  type StatsRecord,
  type SyncProgressPayload,
  type SyncPuzzleState,
} from '@sanakenno/shared';
import { create } from 'zustand';
import {
  fetchPlayerMe,
  fetchPlayerSync,
  postPlayerAuthInit,
  postPlayerLogout,
  postPlayerRotate,
  postPlayerTransferCreate,
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
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  initPlayer: () => Promise<void>;
  revealShareOptions: () => void;
  sendTransferEmail: (email: string) => Promise<void>;
  useTransfer: (token: string) => Promise<void>;
  rotatePlayerKey: () => Promise<void>;
  clearError: () => void;
  logout: () => Promise<void>;
  syncStatsRecord: (record: StatsRecord) => Promise<void>;
  syncPuzzleState: (state: SyncPuzzleState) => Promise<void>;
  syncProgress: (payload: SyncProgressPayload) => Promise<void>;
  syncPreferences: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoggedIn: false,
  playerId: null,
  playerKey: null,
  isLinked: false,
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

      set({
        isLoggedIn: true,
        playerId: me.player_id,
        isLoading: false,
      });

      // Background pull & merge
      const syncData = await fetchPlayerSync(storedToken);
      if (syncData) {
        const localBefore = gatherLocalData();
        pullAndMergeData(syncData, () => void get().syncPreferences());
        pushLocalDataAheadOfServer(localBefore, syncData, {
          syncStatsRecord: (rec) => get().syncStatsRecord(rec),
          syncPuzzleState: (st) => get().syncPuzzleState(st),
        });
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
        isLoading: false,
      });

      // Upload local data to initialize the player on server
      const local = gatherLocalData();
      if (local.stats.records.length > 0 || local.puzzle_states.length > 0) {
        await postPlayerTransferUse({
          token: player_key,
          stats: local.stats,
          puzzle_states: local.puzzle_states,
        }).catch(() => undefined);
      }
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Alustus epäonnistui',
      });
    }
  },

  sendTransferEmail: async (email: string) => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    const playerKey = get().playerKey;
    if (!token || !playerKey) {
      set({ error: 'Kirjautuminen puuttuu' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      await postPlayerTransferCreate(token, { email, player_key: playerKey });
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
    set({ isLoading: true, error: null });
    try {
      const local = gatherLocalData();
      const res = await postPlayerTransferUse({
        token,
        stats: local.stats,
        puzzle_states: local.puzzle_states,
      });

      saveToStorage(AUTH_TOKEN_STORAGE_KEY, res.token);
      saveToStorage(PLAYER_KEY_STORAGE_KEY, token);
      saveToStorage(LINKED_STATE_STORAGE_KEY, 'true');

      set({
        isLoggedIn: true,
        playerId: res.player_id,
        playerKey: token,
        isLinked: true,
        isLoading: false,
      });

      pullAndMergeData(res, () => void get().syncPreferences());
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
      set({ playerKey: player_key, isLoading: false });
    } catch (err: unknown) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Tunnisteen vaihto epäonnistui',
      });
    }
  },

  logout: async () => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (token) {
      await postPlayerLogout(token);
    }
    removeFromStorage(AUTH_TOKEN_STORAGE_KEY);
    removeFromStorage(PLAYER_KEY_STORAGE_KEY);
    removeFromStorage(LINKED_STATE_STORAGE_KEY);
    set({
      isLoggedIn: false,
      playerId: null,
      playerKey: null,
      isLinked: false,
    });
    // Create fresh player identity
    await get().initPlayer();
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

  syncPreferences: async () => {
    const token = loadFromStorage<string>(AUTH_TOKEN_STORAGE_KEY);
    if (!token) return;
    const prefs = buildLocalPreferences();
    await postSyncPreferences(token, prefs);
  },
}));
