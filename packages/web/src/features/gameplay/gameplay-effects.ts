import {
  computeStreak,
  evaluateAchievements,
  getHelsinkiDateString,
  noHintMilestoneStates,
  type PuzzleResponse,
  type RankName,
} from '@sanakenno/shared';
import { postAchievement, postWordFind } from '../../api/client.js';
import { useAuthStore } from '../player-sync/useAuthStore.js';
import { formatAnnouncementCount } from './announcements.js';
import { recordLocalStatsUpdate } from './storage.js';
import { useUiStore } from './useUiStore.js';

export interface AcceptedWordContext {
  normalized: string;
  pts: number;
  pangram: boolean;
  newFoundWords: Set<string>;
  previousScore?: number;
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
}

const NEAR_UNLOCK_PROGRESS_IDS = new Set(['pangrams', 'full_board', 'unassisted_master']);

export function handleAcceptedWordEffects(ctx: AcceptedWordContext): void {
  const {
    normalized,
    pts,
    pangram,
    newFoundWords,
    previousScore,
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
  } = ctx;

  const ui = useUiStore.getState();

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
      ui.setCelebration('taysikenno');
    } else if (newRank === 'Ällistyttävä') {
      ui.setCelebration(visibleHintsUnlocked.length === 0 ? 'nohint-allistyttava' : 'allistyttava');
    }
  }

  if (pangram) {
    ui.triggerPangramRipple();
    ui.showToast(`+${pts}`, 'ok', 2500, 'Pangrammi!', 'special');
  } else {
    ui.showToast(`+${pts}`, 'ok', 2000);
  }

  const firstLetter = normalized[0];
  let letterCleared = false;
  const totalForLetter = firstLetter ? (puzzle.hint_data.by_letter[firstLetter] ?? 0) : 0;
  if (firstLetter && totalForLetter > 0) {
    let foundWithLetter = 0;
    for (const w of foundWords) {
      if (w[0] === firstLetter) foundWithLetter += 1;
    }
    if (foundWithLetter + 1 === totalForLetter) {
      letterCleared = true;
    }
  }

  if (letterCleared && firstLetter) {
    const upper = firstLetter.toUpperCase();
    ui.enqueueAnnouncement({
      kind: 'gameplay',
      category: 'letter_cleared',
      badgeText: upper,
      title: `Kaikki ${upper}-alkuiset sanat löydetty!`,
      metaPill: `${totalForLetter}/${totalForLetter}`,
    });
  }

  if (
    visibleHintsUnlocked.length === 0 &&
    puzzle.max_score > 0 &&
    newRank !== 'Ällistyttävä' &&
    newRank !== 'Täysi kenno'
  ) {
    const prevScore = previousScore ?? Math.max(0, newScore - pts);
    const prevMilestones = noHintMilestoneStates(prevScore, puzzle.max_score);
    const nextMilestones = noHintMilestoneStates(newScore, puzzle.max_score);
    const highestCrossed = nextMilestones
      .filter((m) => {
        if (m.pct === 70) return false;
        const wasUnlocked = prevMilestones.find((p) => p.pct === m.pct)?.unlocked ?? false;
        return m.unlocked && !wasUnlocked;
      })
      .at(-1);

    if (highestCrossed) {
      ui.enqueueAnnouncement({
        kind: 'gameplay',
        category: 'no_hint_milestone',
        badgeText: `${highestCrossed.pct} %`,
        title: highestCrossed.name,
        subtitle: `${highestCrossed.pct} % pisteistä ilman apuja!`,
        metaPill: `${highestCrossed.pct} %`,
      });
    }
  }

  const viewingDate = ui.viewingPuzzleDate;
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
    const unlockedIds = new Set<string>();

    for (const newProg of newEvals) {
      const oldProg = prevEvals.find((p) => p.id === newProg.id);
      const oldTier = oldProg?.unlockedTier ?? 0;
      if (newProg.unlockedTier > oldTier && newProg.currentTier) {
        unlockedIds.add(newProg.id);
        const unitSuffix = newProg.unit ? ` ${newProg.unit}` : '';
        ui.enqueueAnnouncement({
          kind: 'achievement',
          category: 'achievement_unlocked',
          achievementId: newProg.id,
          title: newProg.title,
          subtitle: `Uusi saavutus · ${formatAnnouncementCount(newProg.currentTier.target)}${unitSuffix}`,
          tierKey: newProg.currentTier.key,
          tierName: newProg.currentTier.name,
          isUnlock: true,
        });
      }
    }

    for (const newProg of newEvals) {
      if (unlockedIds.has(newProg.id) || !newProg.nextTier) continue;
      const oldProg = prevEvals.find((p) => p.id === newProg.id);
      const oldVal = oldProg?.currentValue ?? 0;
      const didAdvance = newProg.currentValue > oldVal;
      if (!didAdvance) continue;

      const isStreakAdvance = newProg.id === 'streak' && newStreak.current > prevStreak.current;
      const isNearUnlock =
        NEAR_UNLOCK_PROGRESS_IDS.has(newProg.id) &&
        newProg.nextTier.target - newProg.currentValue === 1;

      if (isStreakAdvance || isNearUnlock) {
        const unitSuffix = newProg.unit ? ` ${newProg.unit}` : '';
        ui.enqueueAnnouncement({
          kind: 'achievement',
          category: 'achievement_progress',
          achievementId: newProg.id,
          title: newProg.title,
          subtitle: `Edistyminen · ${formatAnnouncementCount(newProg.currentValue)} / ${formatAnnouncementCount(newProg.nextTier.target)}${unitSuffix}`,
          tierKey: newProg.nextTier.key,
          tierName: newProg.nextTier.name,
          isUnlock: false,
        });
      }
    }
  }

  // Debounced cloud sync
  const syncPayload = {
    puzzle_number: puzzle.puzzle_number,
    date: ui.viewingPuzzleDate ?? getHelsinkiDateString(),
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
}
