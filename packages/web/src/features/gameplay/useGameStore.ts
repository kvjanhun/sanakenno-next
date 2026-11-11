import { create } from 'zustand';
import {
  buildShareText,
  getHelsinkiDateString,
  isPangram,
  rankForScore,
  recalcScore,
  scoreWord,
  type HintData,
  type PuzzleResponse,
} from '@sanakenno/shared';
import { postFailedGuess } from '../../api/client.js';
import { useAuthStore } from '../player-sync/useAuthStore.js';
import { handleAcceptedWordEffects } from './gameplay-effects.js';
import { hashWord } from './hash.js';
import { filterVisibleHintIds, isVisibleHintId } from './hints.js';
import {
  puzzleStateKey,
  readSavedPuzzleState,
  recordLocalStatsUpdate,
  saveToStorage,
  shareText,
  type PersistedPuzzleState,
} from './storage.js';
import { useUiStore } from './useUiStore.js';

export type { HintData };
export type Puzzle = PuzzleResponse;

export interface GameState {
  puzzle: Puzzle | null;
  outerLetters: string[];
  currentWord: string;
  foundWords: Set<string>;
  score: number;
  hintsUnlocked: Set<string>;
  scoreBeforeHints: number | null;
  startedAt: number;
  totalPausedMs: number;
  newAchievement: {
    id: string;
    title: string;
    tierName: string;
    target: number;
    unit?: string;
  } | null;

  center: () => string;
  allLetters: () => Set<string>;
  wordHashSet: () => Set<string>;
  rank: () => string;
  recentFoundWords: () => string[];
  sortedFoundWords: () => string[];

  loadPuzzle: (puzzle: Puzzle) => Promise<void>;
  addLetter: (letter: string) => void;
  deleteLetter: () => void;
  shuffleLetters: () => void;
  submitWord: () => Promise<void>;
  clearNewAchievement: () => void;
  unlockHint: (id: string) => void;
  tickTimer: (startedAt: number, totalPausedMs: number) => void;
  saveState: () => void;
  loadState: () => Promise<void>;
  copyStatus: () => Promise<void>;
  reset: () => void;
}

function fisherYatesShuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function rejectWord(msg: string, resubmittedWord: string | null = null): void {
  const ui = useUiStore.getState();
  ui.triggerWordShake(resubmittedWord);
  ui.showToast(msg, 'error', 2000, '', 'ok', () => {
    if (useUiStore.getState().wordRejected) {
      useUiStore.getState().clearWordRejection();
      useGameStore.setState({ currentWord: '' });
    }
  });
}

export const useGameStore = create<GameState>()((set, get) => ({
  puzzle: null,
  outerLetters: [],
  currentWord: '',
  foundWords: new Set<string>(),
  score: 0,
  hintsUnlocked: new Set<string>(),
  scoreBeforeHints: null,
  startedAt: 0,
  totalPausedMs: 0,
  newAchievement: null,
  clearNewAchievement: () => set({ newAchievement: null }),

  center: () => get().puzzle?.center ?? '',
  allLetters: () => {
    const { puzzle, outerLetters } = get();
    const s = new Set<string>(outerLetters);
    if (puzzle) s.add(puzzle.center);
    return s;
  },
  wordHashSet: () => new Set<string>(get().puzzle?.word_hashes ?? []),
  rank: () => rankForScore(get().score, get().puzzle?.max_score ?? 0),
  recentFoundWords: () => [...get().foundWords].reverse(),
  sortedFoundWords: () => [...get().foundWords].sort((a, b) => a.localeCompare(b, 'fi')),

  loadPuzzle: async (data: Puzzle) => {
    void useAuthStore.getState().flushPendingSync();
    useUiStore.getState().setCelebration(null);
    useUiStore.getState().clearWordRejection();
    useUiStore.getState().setHintsHidden(true);
    set({
      puzzle: data,
      outerLetters: data.letters.filter((l) => l !== data.center),
      currentWord: '',
      foundWords: new Set<string>(),
      score: 0,
      hintsUnlocked: new Set<string>(),
      scoreBeforeHints: null,
      startedAt: Date.now(),
      totalPausedMs: 0,
    });
    await get().loadState();
  },

  addLetter: (letter: string) => {
    const ui = useUiStore.getState();
    if (ui.wordRejected) {
      ui.clearWordRejection();
      set({ currentWord: letter });
      return;
    }
    set((s) => ({ currentWord: s.currentWord + letter }));
  },

  deleteLetter: () => {
    const ui = useUiStore.getState();
    if (ui.wordRejected) {
      ui.clearWordRejection();
      set({ currentWord: '' });
      return;
    }
    set((s) => ({ currentWord: s.currentWord.slice(0, -1) }));
  },

  shuffleLetters: () => {
    useUiStore.getState().triggerShuffleSpin();
    set((s) => ({ outerLetters: fisherYatesShuffle(s.outerLetters) }));
  },

  submitWord: async () => {
    const state = get();
    const { puzzle, currentWord, foundWords } = state;
    if (!puzzle) return;

    const normalized = currentWord.toLowerCase().replace(/-/g, '');
    if (normalized.length < 4) return rejectWord('Liian lyhyt!');
    if (!normalized.includes(puzzle.center)) {
      return rejectWord(`Kirjain '${puzzle.center.toUpperCase()}' puuttuu!`);
    }

    const validLetters = state.allLetters();
    for (const ch of normalized) {
      if (!validLetters.has(ch)) return rejectWord('Käytä vain annettuja kirjaimia!');
    }
    if (foundWords.has(normalized)) return rejectWord('Löysit jo tämän!', normalized);

    const wordHash = await hashWord(normalized);
    if (!state.wordHashSet().has(wordHash)) {
      postFailedGuess({
        word: normalized,
        date: useUiStore.getState().viewingPuzzleDate ?? getHelsinkiDateString(),
      });
      return rejectWord('Ei sanakirjassa');
    }

    const pts = scoreWord(normalized, validLetters);
    const pangram = isPangram(normalized, validLetters);
    const newFoundWords = new Set(foundWords).add(normalized);
    const newScore = state.score + pts;
    const previousRank = rankForScore(state.score, puzzle.max_score);
    const newRank = rankForScore(newScore, puzzle.max_score);
    const visibleHintsUnlocked = filterVisibleHintIds(state.hintsUnlocked);
    const bestNoHintScore =
      visibleHintsUnlocked.length === 0 ? newScore : (state.scoreBeforeHints ?? 0);

    useUiStore.getState().clearWordRejection();
    set({ foundWords: newFoundWords, score: newScore, currentWord: '' });
    get().saveState();

    handleAcceptedWordEffects({
      normalized,
      pts,
      pangram,
      newFoundWords,
      newScore,
      previousRank,
      newRank,
      visibleHintsUnlocked,
      bestNoHintScore,
      validLetters,
      puzzle,
      startedAt: state.startedAt,
      totalPausedMs: state.totalPausedMs,
      scoreBeforeHints: state.scoreBeforeHints,
      foundWords,
      onNewAchievement: (newAchievement) => set({ newAchievement }),
    });
  },

  unlockHint: (id: string) => {
    if (!isVisibleHintId(id)) return;
    useUiStore.getState().setHintsHidden(false);
    set((s) => {
      if (s.hintsUnlocked.has(id)) return s;
      const isFirst = s.hintsUnlocked.size === 0;
      const next = new Set(s.hintsUnlocked).add(id);
      return { hintsUnlocked: next, ...(isFirst ? { scoreBeforeHints: s.score } : {}) };
    });
    get().saveState();
  },

  tickTimer: (startedAt: number, totalPausedMs: number) => {
    set({ startedAt, totalPausedMs });
    get().saveState();
  },

  saveState: () => {
    const { puzzle, foundWords, score, hintsUnlocked, startedAt, totalPausedMs, scoreBeforeHints } =
      get();
    if (!puzzle) return;
    const data: PersistedPuzzleState = {
      foundWords: [...foundWords],
      score,
      hintsUnlocked: filterVisibleHintIds(hintsUnlocked),
      startedAt,
      totalPausedMs,
      scoreBeforeHints,
    };
    saveToStorage(puzzleStateKey(puzzle.puzzle_number), data);
  },

  loadState: async () => {
    const { puzzle } = get();
    if (!puzzle) return;
    const saved = readSavedPuzzleState(puzzle.puzzle_number);
    if (!saved) {
      set({
        foundWords: new Set<string>(),
        score: 0,
        hintsUnlocked: new Set<string>(),
        scoreBeforeHints: null,
        startedAt: Date.now(),
        totalPausedMs: 0,
      });
      useUiStore.getState().setHintsHidden(true);
      return;
    }

    const hashSet = new Set(puzzle.word_hashes);
    const validWords: string[] = [];
    for (const word of saved.foundWords) {
      if (hashSet.has(await hashWord(word))) validWords.push(word);
    }

    const allLetters = new Set<string>([puzzle.center, ...puzzle.letters]);
    const score =
      validWords.length !== saved.foundWords.length
        ? recalcScore(validWords, allLetters)
        : saved.score;

    const visibleHints = filterVisibleHintIds(saved.hintsUnlocked ?? []);
    set({
      foundWords: new Set(validWords),
      score,
      hintsUnlocked: new Set(visibleHints),
      scoreBeforeHints: saved.scoreBeforeHints ?? null,
      startedAt: saved.startedAt || Date.now(),
      totalPausedMs: saved.totalPausedMs ?? 0,
    });

    const hasHintsOpened = visibleHints.length > 0;
    useUiStore.getState().setHintsHidden(!hasHintsOpened);

    if (validWords.length > 0) {
      const viewingDate = useUiStore.getState().viewingPuzzleDate;
      const isDaily =
        viewingDate === null && (puzzle.date ? puzzle.date === getHelsinkiDateString() : true);
      const newRank = rankForScore(score, puzzle.max_score);
      const bestNoHintScore = visibleHints.length === 0 ? score : (saved.scoreBeforeHints ?? 0);

      recordLocalStatsUpdate({
        puzzleNumber: puzzle.puzzle_number,
        dateStr: viewingDate ?? puzzle.date ?? getHelsinkiDateString(),
        rank: newRank,
        score,
        maxScore: puzzle.max_score,
        foundWords: new Set(validWords),
        validLetters: allLetters,
        hintsUsed: visibleHints.length,
        elapsedMs: Math.max(
          0,
          Date.now() - (saved.startedAt || Date.now()) - (saved.totalPausedMs ?? 0),
        ),
        bestNoHintScore,
        isDaily,
      });
    }
  },

  copyStatus: async () => {
    const { puzzle, score, hintsUnlocked, scoreBeforeHints } = get();
    if (!puzzle) return;
    const text = buildShareText({
      displayNumber: puzzle.display_number,
      score,
      maxScore: puzzle.max_score,
      hintsUnlocked,
      scoreBeforeHints,
    });
    if ((await shareText(text)) === 'clipboard') {
      useUiStore.getState().setShareCopied(true);
      setTimeout(() => useUiStore.getState().setShareCopied(false), 2000);
    }
  },

  reset: () => {
    useUiStore.getState().resetUi();
    set({
      puzzle: null,
      outerLetters: [],
      currentWord: '',
      foundWords: new Set<string>(),
      score: 0,
      hintsUnlocked: new Set<string>(),
      scoreBeforeHints: null,
      startedAt: 0,
      totalPausedMs: 0,
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('sanakenno:sync-reload', () => {
    void useGameStore.getState().loadState();
  });
}
