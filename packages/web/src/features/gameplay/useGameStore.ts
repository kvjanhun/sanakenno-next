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
  type RankName,
} from '@sanakenno/shared';
import { postAchievement, postFailedGuess, postWordFind } from '../../api/client.js';
import { useAuthStore } from '../player-sync/useAuthStore.js';
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
    useUiStore.getState().setCelebration(null);
    useUiStore.getState().clearWordRejection();
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

  shuffleLetters: () => set((s) => ({ outerLetters: fisherYatesShuffle(s.outerLetters) })),

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

    postWordFind({ word: normalized, puzzle_number: puzzle.puzzle_number });

    useUiStore.getState().clearWordRejection();
    set({ foundWords: newFoundWords, score: newScore, currentWord: '' });
    get().saveState();

    if (newRank !== previousRank) {
      postAchievement({
        puzzle_number: puzzle.puzzle_number,
        rank: newRank as RankName,
        score: newScore,
        max_score: puzzle.max_score,
        words_found: newFoundWords.size,
        elapsed_ms: Math.max(0, Date.now() - state.startedAt - state.totalPausedMs),
      });

      if (newRank === 'Täysi kenno') {
        useUiStore.getState().setCelebration('taysikenno');
      } else if (newRank === 'Ällistyttävä') {
        useUiStore
          .getState()
          .setCelebration(
            visibleHintsUnlocked.length === 0 ? 'nohint-allistyttava' : 'allistyttava',
          );
      }
    }

    recordLocalStatsUpdate({
      puzzleNumber: puzzle.puzzle_number,
      dateStr: useUiStore.getState().viewingPuzzleDate ?? getHelsinkiDateString(),
      rank: newRank,
      score: newScore,
      maxScore: puzzle.max_score,
      foundWords: newFoundWords,
      validLetters,
      hintsUsed: visibleHintsUnlocked.length,
      elapsedMs: Math.max(0, Date.now() - state.startedAt - state.totalPausedMs),
      bestNoHintScore,
    });

    void useAuthStore.getState().syncProgress({
      puzzle_number: puzzle.puzzle_number,
      date: useUiStore.getState().viewingPuzzleDate ?? getHelsinkiDateString(),
      found_words: [...newFoundWords],
      score: newScore,
      hints_unlocked: visibleHintsUnlocked,
      started_at: state.startedAt,
      total_paused_ms: state.totalPausedMs,
      score_before_hints: state.scoreBeforeHints,
      max_score: puzzle.max_score,
      best_no_hint_score: bestNoHintScore,
    });

    if (pangram) {
      useUiStore.getState().showToast(`+${pts}`, 'ok', 2000, 'Pangrammi!', 'special');
    } else {
      useUiStore.getState().showToast(`+${pts}`, 'ok', 2000);
    }
  },

  unlockHint: (id: string) => {
    if (!isVisibleHintId(id)) return;
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
    if (!saved) return;

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

    set({
      foundWords: new Set(validWords),
      score,
      hintsUnlocked: new Set(filterVisibleHintIds(saved.hintsUnlocked ?? [])),
      scoreBeforeHints: saved.scoreBeforeHints ?? null,
      startedAt: saved.startedAt || Date.now(),
      totalPausedMs: saved.totalPausedMs ?? 0,
    });
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
