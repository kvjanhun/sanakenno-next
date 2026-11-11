import {
  computeStreak,
  evaluateAchievements,
  getHelsinkiDateString,
  type PuzzleResponse,
  type RankName,
} from '@sanakenno/shared';
import { postAchievement, postWordFind } from '../../api/client.js';
import { useAuthStore } from '../player-sync/useAuthStore.js';
import { recordLocalStatsUpdate } from './storage.js';
import { useUiStore } from './useUiStore.js';

export interface AcceptedWordContext {
  normalized: string;
  pts: number;
  pangram: boolean;
  newFoundWords: Set<string>;
  newScore: number;
  previousRank: string;
  newRank: string;
  visibleHintsUnlocked: string[];
  bestNoHintScore: number;
  validLetters: Set<string>;
  puzzle: PuzzleResponse;
  startedAt: number;
  totalPausedMs: number;
  scoreBeforeHints: number | null;
  foundWords: Set<string>;
  onNewAchievement: (ach: {
    id: string;
    title: string;
    tierName: string;
    target: number;
    unit?: string;
  }) => void;
}

export function handleAcceptedWordEffects(ctx: AcceptedWordContext): void {
  const {
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
    startedAt,
    totalPausedMs,
    scoreBeforeHints,
    foundWords,
    onNewAchievement,
  } = ctx;

  postWordFind({ word: normalized, puzzle_number: puzzle.puzzle_number });

  if (newRank !== previousRank) {
    postAchievement({
      puzzle_number: puzzle.puzzle_number,
      rank: newRank as RankName,
      score: newScore,
      max_score: puzzle.max_score,
      words_found: newFoundWords.size,
      elapsed_ms: Math.max(0, Date.now() - startedAt - totalPausedMs),
    });

    if (newRank === 'Täysi kenno') {
      useUiStore.getState().setCelebration('taysikenno');
    } else if (newRank === 'Ällistyttävä') {
      useUiStore
        .getState()
        .setCelebration(visibleHintsUnlocked.length === 0 ? 'nohint-allistyttava' : 'allistyttava');
    }
  }

  const viewingDate = useUiStore.getState().viewingPuzzleDate;
  const isDaily =
    viewingDate === null && (puzzle.date ? puzzle.date === getHelsinkiDateString() : true);

  const statsResult = recordLocalStatsUpdate({
    puzzleNumber: puzzle.puzzle_number,
    dateStr: viewingDate ?? getHelsinkiDateString(),
    rank: newRank,
    score: newScore,
    maxScore: puzzle.max_score,
    foundWords: newFoundWords,
    validLetters,
    hintsUsed: visibleHintsUnlocked.length,
    elapsedMs: Math.max(0, Date.now() - startedAt - totalPausedMs),
    bestNoHintScore,
    isDaily,
  });

  if (statsResult) {
    const prevStreak = computeStreak(statsResult.previous.records);
    const newStreak = computeStreak(statsResult.updated.records);
    const prevEvals = evaluateAchievements(statsResult.previous, prevStreak);
    const newEvals = evaluateAchievements(statsResult.updated, newStreak);

    for (const newProg of newEvals) {
      const oldProg = prevEvals.find((p) => p.id === newProg.id);
      const oldTier = oldProg?.unlockedTier ?? 0;
      if (newProg.unlockedTier > oldTier && newProg.currentTier) {
        const tier = newProg.currentTier;
        onNewAchievement({
          id: newProg.id,
          title: newProg.title,
          tierName: tier.name,
          target: tier.target,
          unit: newProg.unit,
        });
        break;
      }
    }
  }

  // Debounced cloud sync
  const syncPayload = {
    puzzle_number: puzzle.puzzle_number,
    date: useUiStore.getState().viewingPuzzleDate ?? getHelsinkiDateString(),
    found_words: [...newFoundWords],
    score: newScore,
    hints_unlocked: visibleHintsUnlocked,
    started_at: startedAt,
    total_paused_ms: totalPausedMs,
    score_before_hints: scoreBeforeHints,
    max_score: puzzle.max_score,
    best_no_hint_score: bestNoHintScore,
  };

  useAuthStore.getState().syncProgressDebounced(syncPayload);

  // Immediate flush on major milestones
  if (newRank === 'Ällistyttävä' || newRank === 'Täysi kenno') {
    void useAuthStore.getState().flushPendingSync();
  }

  const firstLetter = normalized[0];
  let letterCleared = false;
  if (firstLetter && puzzle.hint_data.by_letter[firstLetter]) {
    const totalForLetter = puzzle.hint_data.by_letter[firstLetter];
    let foundWithLetter = 0;
    for (const w of foundWords) {
      if (w[0] === firstLetter) foundWithLetter += 1;
    }
    if (foundWithLetter + 1 === totalForLetter) {
      letterCleared = true;
    }
  }

  if (pangram) {
    useUiStore.getState().triggerPangramRipple();
    const secondary = letterCleared
      ? `Pangrammi! · Kaikki ${firstLetter?.toUpperCase()}-sanat!`
      : 'Pangrammi!';
    useUiStore.getState().showToast(`+${pts}`, 'ok', 2500, secondary, 'special');
  } else if (letterCleared) {
    useUiStore
      .getState()
      .showToast(
        `+${pts}`,
        'ok',
        2500,
        `Kaikki ${firstLetter?.toUpperCase()}-alkuiset löydetty!`,
        'special',
      );
  } else {
    useUiStore.getState().showToast(`+${pts}`, 'ok', 2000);
  }
}
