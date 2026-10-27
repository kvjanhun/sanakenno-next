import { noHintAchievementStates, rankForScore } from './scoring.js';

type HintCollection = ReadonlySet<string> | readonly string[] | null;

export interface ShareTextInput {
  /** The puzzle number as players see it: its position in the rotation. */
  displayNumber: number;
  score: number;
  maxScore: number;
  hintsUnlocked: HintCollection;
  scoreBeforeHints: number | null;
}

function hasUnlockedHints(hintsUnlocked: HintCollection): boolean {
  if (!hintsUnlocked) return false;
  return 'size' in hintsUnlocked ? hintsUnlocked.size > 0 : hintsUnlocked.length > 0;
}

function clampedPercentage(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

function progressBar(score: number, maxScore: number): string {
  const filled = maxScore > 0 ? Math.max(0, Math.min(10, Math.round((score / maxScore) * 10))) : 0;
  return '\u{1F7E7}'.repeat(filled) + '\u2B1B'.repeat(10 - filled);
}

function noHintScoreForShare({ score, hintsUnlocked, scoreBeforeHints }: ShareTextInput): number {
  return hasUnlockedHints(hintsUnlocked) ? (scoreBeforeHints ?? 0) : score;
}

function noHintAchievementLine(input: ShareTextInput): string {
  const noHintScore = noHintScoreForShare(input);
  const states = noHintAchievementStates(noHintScore, input.maxScore);
  const stars = states.map((state) => (state.unlocked ? '\u2B50\uFE0F' : '\u26AB\uFE0F')).join('');
  const percentage = clampedPercentage(noHintScore, input.maxScore);
  const allStars = states.length > 0 && states.every((state) => state.unlocked);

  return `${stars}  ${percentage}% ilman apuja${allStars ? '!' : ''}`;
}

/** Build the copy/share text for a completed or in-progress Sanakenno result. */
export function buildShareText(input: ShareTextInput): string {
  const rank = rankForScore(input.score, input.maxScore);
  const rankPrefix =
    rank === '\u00C4llistytt\u00E4v\u00E4' || rank === 'T\u00E4ysi kenno' ? '\u{1F3C6} ' : '';

  return [
    `Sanakenno \u2014 Kenno #${input.displayNumber}`,
    `${rankPrefix}${rank} \u00B7 ${input.score}/${input.maxScore} p.`,
    progressBar(input.score, input.maxScore),
    noHintAchievementLine(input),
    'sanakenno.fi',
  ].join('\n');
}
