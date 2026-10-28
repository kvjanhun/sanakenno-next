import {
  emptyStats,
  isPangram,
  STATS_STORAGE_KEY,
  updateStatsRecord,
  type PlayerStats,
} from '@sanakenno/shared';
import { filterVisibleHintIds } from './hints.js';

export { STATS_STORAGE_KEY };

/** Legacy single-slot storage key used prior to per-slot keying. */
export const LEGACY_STATE_KEY = 'sanakenno_state';

/** Persisted puzzle progress shape stored under `sanakenno_state_<slot>`. */
export interface PersistedPuzzleState {
  foundWords: string[];
  score: number;
  hintsUnlocked: string[];
  startedAt: number;
  totalPausedMs: number;
  /** Score at the moment the first hint was unlocked; null if no hints used. */
  scoreBeforeHints: number | null;
}

/** Legacy persisted shape including puzzleNumber inside the payload. */
export interface LegacyPersistedPuzzleState extends PersistedPuzzleState {
  puzzleNumber: number;
}

/** Build the localStorage key for a puzzle slot (`sanakenno_state_<slot>`). */
export function puzzleStateKey(puzzleNumber: number): string {
  return `sanakenno_state_${puzzleNumber}`;
}

/** Build the localStorage key for a revealed puzzle flag (`revealed_<slot>`). */
export function revealedKey(puzzleNumber: number): string {
  return `revealed_${puzzleNumber}`;
}

/** Return true when the player has revealed answers for the given puzzle slot. */
export function isPuzzleRevealed(puzzleNumber: number): boolean {
  return getRawStorage(revealedKey(puzzleNumber)) === 'true';
}

/** Serialize and write a value to localStorage, ignoring quota errors gracefully. */
export function saveToStorage<T>(key: string, data: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      return;
    }
    throw err;
  }
}

/** Read and parse a JSON value from localStorage, returning null on missing/corrupt data. */
export function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Remove a key from localStorage. */
export function removeFromStorage(key: string): void {
  window.localStorage.removeItem(key);
}

/** Read a raw string value from localStorage. */
export function getRawStorage(key: string): string | null {
  return window.localStorage.getItem(key);
}

/** Write a raw string value to localStorage. */
export function setRawStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      return;
    }
    throw err;
  }
}

/** Read saved puzzle state for a slot, migrating legacy single-slot storage if matching. */
export function readSavedPuzzleState(puzzleNumber: number): PersistedPuzzleState | null {
  const key = puzzleStateKey(puzzleNumber);
  const saved = loadFromStorage<PersistedPuzzleState>(key);
  if (saved) return saved;

  const legacy = loadFromStorage<LegacyPersistedPuzzleState>(LEGACY_STATE_KEY);
  if (legacy && legacy.puzzleNumber === puzzleNumber) {
    const migrated: PersistedPuzzleState = {
      foundWords: legacy.foundWords,
      score: legacy.score,
      hintsUnlocked: filterVisibleHintIds(legacy.hintsUnlocked),
      startedAt: legacy.startedAt,
      totalPausedMs: legacy.totalPausedMs,
      scoreBeforeHints: null,
    };
    saveToStorage(key, migrated);
    removeFromStorage(LEGACY_STATE_KEY);
    return migrated;
  }
  return null;
}

/** Update `sanakenno_player_stats` in localStorage unless `revealed_<slot>` is set. */
export function recordLocalStatsUpdate(params: {
  puzzleNumber: number;
  dateStr: string;
  rank: string;
  score: number;
  maxScore: number;
  foundWords: Set<string>;
  validLetters: Set<string>;
  hintsUsed: number;
  elapsedMs: number;
  bestNoHintScore: number;
}): void {
  if (isPuzzleRevealed(params.puzzleNumber)) return;
  let longestWord = '';
  let pangramsFound = 0;
  for (const w of params.foundWords) {
    if (w.length > longestWord.length) longestWord = w;
    if (isPangram(w, params.validLetters)) pangramsFound++;
  }
  const existing = loadFromStorage<PlayerStats>(STATS_STORAGE_KEY) ?? emptyStats();
  const updated = updateStatsRecord(existing, {
    puzzle_number: params.puzzleNumber,
    date: params.dateStr,
    best_rank: params.rank,
    best_score: params.score,
    max_score: params.maxScore,
    words_found: params.foundWords.size,
    hints_used: params.hintsUsed,
    elapsed_ms: params.elapsedMs,
    longest_word: longestWord,
    pangrams_found: pangramsFound,
    best_no_hint_score: params.bestNoHintScore,
  });
  saveToStorage(STATS_STORAGE_KEY, updated);
}

/** Copy text to clipboard or Web Share API, returning the method used. */
export async function shareText(text: string): Promise<'share' | 'clipboard' | 'none'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'share';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'none';
      }
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    }
  } catch {
    // Fall through
  }
  return 'none';
}
