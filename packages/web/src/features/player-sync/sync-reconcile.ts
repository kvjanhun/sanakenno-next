import {
  emptyStats,
  isPuzzleStateBetterThanServer,
  isStatsRecordBetterThanServer,
  mergePuzzleState,
  mergeStatsRecord,
  STATS_STORAGE_KEY,
  type PlayerPreferences,
  type PlayerStats,
  type StatsRecord,
  type SyncPayload,
  type SyncPuzzleState,
} from '@sanakenno/shared';
import { filterVisibleHintIds } from '../gameplay/hints.js';
import {
  getRawStorage,
  loadFromStorage,
  puzzleStateKey,
  saveToStorage,
  type PersistedPuzzleState,
} from '../gameplay/storage.js';
import { usePaletteStore } from '../theme/usePaletteStore.js';
import { useThemePreferenceStore } from '../theme/useThemePreferenceStore.js';

export const AUTH_TOKEN_STORAGE_KEY = 'sanakenno_auth_token';
export const PLAYER_KEY_STORAGE_KEY = 'sanakenno_player_key';
export const PREFERENCES_UPDATED_AT_KEY = 'sanakenno_preferences_updated_at';
export const LINKED_STATE_STORAGE_KEY = 'sanakenno_device_linked';

export function gatherLocalData(): {
  stats: PlayerStats;
  puzzle_states: SyncPuzzleState[];
} {
  const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY) ?? emptyStats();
  const puzzle_states: SyncPuzzleState[] = [];

  for (const record of stats.records) {
    const raw = getRawStorage(puzzleStateKey(record.puzzle_number));
    if (!raw) continue;
    try {
      const saved = JSON.parse(raw) as PersistedPuzzleState;
      puzzle_states.push({
        puzzle_number: record.puzzle_number,
        found_words: saved.foundWords ?? [],
        score: saved.score ?? 0,
        hints_unlocked: filterVisibleHintIds(saved.hintsUnlocked ?? []),
        started_at: saved.startedAt ?? 0,
        total_paused_ms: saved.totalPausedMs ?? 0,
        score_before_hints: saved.scoreBeforeHints ?? null,
      });
    } catch {
      // Ignore unparseable state.
    }
  }

  return { stats, puzzle_states };
}

export function buildLocalPreferences(): PlayerPreferences {
  return {
    themeId: usePaletteStore.getState().themeId,
    themePreference: useThemePreferenceStore.getState().preference,
    updated_at: loadFromStorage<string>(PREFERENCES_UPDATED_AT_KEY) ?? new Date(0).toISOString(),
  };
}

export function applyServerPreferences(
  server: PlayerPreferences | null | undefined,
  syncPush: () => void,
): void {
  const localTs = loadFromStorage<string>(PREFERENCES_UPDATED_AT_KEY) ?? new Date(0).toISOString();

  if (!server) {
    if (Date.parse(localTs) > 0) syncPush();
    return;
  }

  if (Date.parse(localTs) >= Date.parse(server.updated_at)) {
    if (Date.parse(localTs) > Date.parse(server.updated_at)) syncPush();
    return;
  }

  if (server.themeId) usePaletteStore.getState().setLocal(server.themeId);
  if (server.themePreference) {
    useThemePreferenceStore.getState().setLocal(server.themePreference);
  }
  saveToStorage(PREFERENCES_UPDATED_AT_KEY, server.updated_at);
}

export function pullAndMergeData(payload: SyncPayload, onPushPreferences: () => void): boolean {
  let changed = false;
  const localStats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY) ?? emptyStats();

  // Merge stats
  if (payload.stats?.records) {
    const mergedRecords = [...localStats.records];
    for (const serverRecord of payload.stats.records) {
      const idx = mergedRecords.findIndex((r) => r.puzzle_number === serverRecord.puzzle_number);
      if (idx === -1) {
        mergedRecords.push(serverRecord);
        changed = true;
      } else {
        const localRecord = mergedRecords[idx]!;
        const merged = mergeStatsRecord(localRecord, serverRecord);
        if (JSON.stringify(merged) !== JSON.stringify(localRecord)) {
          mergedRecords[idx] = merged;
          changed = true;
        }
      }
    }
    if (changed) {
      saveToStorage(STATS_STORAGE_KEY, { records: mergedRecords });
    }
  }

  // Merge puzzle states
  if (payload.puzzle_states) {
    for (const serverState of payload.puzzle_states) {
      const key = puzzleStateKey(serverState.puzzle_number);
      const raw = getRawStorage(key);
      if (!raw) {
        const newState: PersistedPuzzleState = {
          foundWords: serverState.found_words,
          score: serverState.score,
          hintsUnlocked: serverState.hints_unlocked,
          startedAt: serverState.started_at,
          totalPausedMs: serverState.total_paused_ms,
          scoreBeforeHints: serverState.score_before_hints,
        };
        saveToStorage(key, newState);
        changed = true;
      } else {
        try {
          const localParsed = JSON.parse(raw) as PersistedPuzzleState;
          const localAsSync: SyncPuzzleState = {
            puzzle_number: serverState.puzzle_number,
            found_words: localParsed.foundWords ?? [],
            score: localParsed.score ?? 0,
            hints_unlocked: localParsed.hintsUnlocked ?? [],
            started_at: localParsed.startedAt ?? 0,
            total_paused_ms: localParsed.totalPausedMs ?? 0,
            score_before_hints: localParsed.scoreBeforeHints ?? null,
          };
          const merged = mergePuzzleState(localAsSync, serverState);
          const mergedPersisted: PersistedPuzzleState = {
            foundWords: merged.found_words,
            score: merged.score,
            hintsUnlocked: merged.hints_unlocked,
            startedAt: merged.started_at,
            totalPausedMs: merged.total_paused_ms,
            scoreBeforeHints: merged.score_before_hints,
          };
          if (JSON.stringify(mergedPersisted) !== JSON.stringify(localParsed)) {
            saveToStorage(key, mergedPersisted);
            changed = true;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  applyServerPreferences(payload.preferences, onPushPreferences);
  return changed;
}

export function pushLocalDataAheadOfServer(
  local: ReturnType<typeof gatherLocalData>,
  server: SyncPayload,
  actions: {
    syncStatsRecord: (record: StatsRecord) => Promise<void>;
    syncPuzzleState: (state: SyncPuzzleState) => Promise<void>;
  },
): { pushedStats: number; pushedStates: number } {
  let pushedStats = 0;
  let pushedStates = 0;

  const serverStatsByPuzzle = new Map(
    (server.stats?.records ?? []).map((record) => [record.puzzle_number, record]),
  );
  const serverStatesByPuzzle = new Map(
    (server.puzzle_states ?? []).map((state) => [state.puzzle_number, state]),
  );

  for (const record of local.stats.records) {
    if (isStatsRecordBetterThanServer(record, serverStatsByPuzzle.get(record.puzzle_number))) {
      void actions.syncStatsRecord(record);
      pushedStats++;
    }
  }

  for (const state of local.puzzle_states) {
    if (isPuzzleStateBetterThanServer(state, serverStatesByPuzzle.get(state.puzzle_number))) {
      void actions.syncPuzzleState(state);
      pushedStates++;
    }
  }

  return { pushedStats, pushedStates };
}
