import {
  AUTH_TOKEN_STORAGE_KEY,
  emptyStats,
  getHelsinkiDateString,
  isPuzzleStateBetterThanServer,
  isStatsRecordBetterThanServer,
  mergePuzzleState,
  mergeStatsRecord,
  STATS_STORAGE_KEY,
  type PlayerPreferences,
  type PlayerStats,
  type SyncPayload,
  type SyncProgressPayload,
  type SyncPuzzleState,
} from '@sanakenno/shared';
import { filterVisibleHintIds } from '../gameplay/hints.js';
import {
  getRawStorage,
  isPuzzleRevealed,
  loadFromStorage,
  puzzleStateKey,
  saveToStorage,
  type PersistedPuzzleState,
} from '../gameplay/storage.js';
import { PREFERENCES_UPDATED_AT_KEY, usePaletteStore } from '../theme/usePaletteStore.js';
import { useThemePreferenceStore } from '../theme/useThemePreferenceStore.js';

export { AUTH_TOKEN_STORAGE_KEY, PREFERENCES_UPDATED_AT_KEY };
export const PLAYER_KEY_STORAGE_KEY = 'sanakenno_player_key';
export const LINKED_STATE_STORAGE_KEY = 'sanakenno_device_linked';

export function gatherLocalData(): {
  stats: PlayerStats;
  puzzle_states: SyncPuzzleState[];
} {
  const stats = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY) ?? emptyStats();
  const puzzle_states: SyncPuzzleState[] = [];
  const statsSlotSet = new Set(stats.records.map((r) => r.puzzle_number));
  const candidateSlots = new Set<number>(statsSlotSet);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        const match = key ? /^sanakenno_state_(\d+)$/.exec(key) : null;
        if (match?.[1]) {
          candidateSlots.add(Number(match[1]));
        }
      }
    } catch {
      // Ignore storage enumeration issues
    }
  }

  for (const puzzleNumber of candidateSlots) {
    if (isPuzzleRevealed(puzzleNumber)) continue;
    const raw = getRawStorage(puzzleStateKey(puzzleNumber));
    if (!raw) continue;
    try {
      const saved = JSON.parse(raw) as PersistedPuzzleState;
      const foundWords = Array.isArray(saved.foundWords) ? saved.foundWords : [];
      const hintsUnlocked = filterVisibleHintIds(saved.hintsUnlocked ?? []);
      if (
        !statsSlotSet.has(puzzleNumber) &&
        foundWords.length === 0 &&
        hintsUnlocked.length === 0
      ) {
        continue;
      }
      puzzle_states.push({
        puzzle_number: puzzleNumber,
        found_words: foundWords,
        score: saved.score ?? 0,
        hints_unlocked: hintsUnlocked,
        started_at: saved.startedAt ?? 0,
        total_paused_ms: saved.totalPausedMs ?? 0,
        score_before_hints: hintsUnlocked.length > 0 ? (saved.scoreBeforeHints ?? null) : null,
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
      saveToStorage(STATS_STORAGE_KEY, { records: mergedRecords, version: 1 });
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
    syncProgress: (payload: SyncProgressPayload) => Promise<void>;
  },
): { pushedPuzzles: number } {
  let pushedPuzzles = 0;

  const localStatsByPuzzle = new Map(
    local.stats.records.map((record) => [record.puzzle_number, record]),
  );
  const localStatesByPuzzle = new Map(
    local.puzzle_states.map((state) => [state.puzzle_number, state]),
  );
  const serverStatsByPuzzle = new Map(
    (server.stats?.records ?? []).map((record) => [record.puzzle_number, record]),
  );
  const serverStatesByPuzzle = new Map(
    (server.puzzle_states ?? []).map((state) => [state.puzzle_number, state]),
  );

  const candidatePuzzles = new Set<number>([
    ...localStatsByPuzzle.keys(),
    ...localStatesByPuzzle.keys(),
  ]);

  for (const puzzleNumber of candidatePuzzles) {
    const localRecord = localStatsByPuzzle.get(puzzleNumber);
    const localState = localStatesByPuzzle.get(puzzleNumber);
    const serverRecord = serverStatsByPuzzle.get(puzzleNumber);
    const serverState = serverStatesByPuzzle.get(puzzleNumber);

    const statsAhead = Boolean(
      localRecord && isStatsRecordBetterThanServer(localRecord, serverRecord),
    );
    const stateAhead = Boolean(
      localState && isPuzzleStateBetterThanServer(localState, serverState),
    );

    if (statsAhead || stateAhead) {
      void actions.syncProgress({
        puzzle_number: puzzleNumber,
        date: localRecord?.date ?? serverRecord?.date ?? getHelsinkiDateString(),
        found_words: localState?.found_words ?? [],
        score: localState?.score ?? localRecord?.best_score ?? 0,
        hints_unlocked: localState?.hints_unlocked ?? [],
        started_at: localState?.started_at ?? 0,
        total_paused_ms: localState?.total_paused_ms ?? 0,
        score_before_hints:
          localState && localState.hints_unlocked.length > 0
            ? (localState.score_before_hints ?? localRecord?.best_no_hint_score ?? null)
            : null,
        max_score: localRecord?.max_score ?? serverRecord?.max_score ?? 100,
        best_no_hint_score: localRecord?.best_no_hint_score,
        is_daily: localRecord?.is_daily,
        played_at_date: localRecord?.played_at_date,
      });
      pushedPuzzles++;
    }
  }

  return { pushedPuzzles };
}
