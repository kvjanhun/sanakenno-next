import type {
  AdminCombinationVariation,
  AdminSuggestionResponse,
  PangramQualityGrade,
  SuggestionQualityGrade,
} from '@sanakenno/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema.js';
import { getPuzzleBySlot } from '../admin-puzzles/admin-puzzles.queries.js';
import { getActiveSlots, getBlockedWords, totalPuzzles } from '../puzzle/puzzle.queries.js';
import { computePuzzle, puzzleWords } from '../puzzle/wordlist.js';
import {
  getCombinationCandidateRows,
  getRecentPuzzles,
  getUsedLettersKeys,
} from './admin-suggestions.queries.js';
import {
  candidateReasons,
  loadCuratedPangramQuality,
  neighborOverlap,
  normalizeLettersKey,
  pangramPenalty,
  preferredSuggestionTarget,
  preferredWordCountBand,
  qualityLabel,
  qualityScore,
  recentPenalty,
  selectCandidatePool,
  suggestionKey,
  wordCountPenalty,
  type PreliminaryCandidate,
} from './suggestion-scorer.js';

export interface SuggestPuzzleOptions {
  declined?: string[];
  minWords?: number;
  maxWords?: number;
  includePangrams?: boolean;
}

const DEFAULT_MIN_WORDS = 18;
const DEFAULT_MAX_WORDS = 80;
const MAX_PANGRAMS = 5;
const PRELIMINARY_LIMIT = 300;

function parseVariations(raw: string): AdminCombinationVariation[] {
  try {
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list)) return [];
    return list.map((item) => {
      const rec = item as Record<string, unknown>;
      return {
        center: String(rec.center ?? ''),
        word_count: Number(rec.word_count ?? 0),
        max_score: Number(rec.max_score ?? 0),
        pangrams: Number(rec.pangrams ?? 0),
      };
    });
  } catch {
    return [];
  }
}

function shortWordSet(letters: string[], center: string, blocked: string[]): Set<string> {
  const words = puzzleWords(letters, center, blocked, { minLength: 4, maxLength: 5 });
  return new Set(words);
}

export async function suggestPuzzle(
  db: Kysely<Database>,
  options: SuggestPuzzleOptions = {},
): Promise<AdminSuggestionResponse | null> {
  const minWords = options.minWords ?? DEFAULT_MIN_WORDS;
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
  const includePangrams = options.includePangrams === true;

  const curatedQuality = loadCuratedPangramQuality();
  const declined = new Set(
    (options.declined ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean),
  );
  const usedKeys = await getUsedLettersKeys(db);
  const recentRows = await getRecentPuzzles(db, 7);
  const blockedWords = await getBlockedWords(db);
  const total = await totalPuzzles(db);

  const preferredTarget = preferredSuggestionTarget(total, declined.size);
  const preferredBand = preferredWordCountBand(preferredTarget);
  const preferredPangrams = preferredTarget.pangrams;

  const rows = await getCombinationCandidateRows(db, minWords, maxWords, MAX_PANGRAMS);
  const preliminary: PreliminaryCandidate[] = [];

  for (const row of rows) {
    const lettersKey = normalizeLettersKey(row.letters);
    if (usedKeys.has(lettersKey)) continue;

    const letters = Array.from(lettersKey);
    const variations = parseVariations(row.variations);

    for (const variation of variations) {
      const key = suggestionKey(letters, variation.center);
      if (declined.has(key)) continue;

      if (
        variation.word_count < minWords ||
        variation.word_count > maxWords ||
        variation.pangrams < 1 ||
        variation.pangrams > MAX_PANGRAMS
      ) {
        continue;
      }

      const qualityGrade = curatedQuality[key];
      if (qualityGrade === 'reject') continue;

      const grade: SuggestionQualityGrade = (qualityGrade as PangramQualityGrade) || 'unreviewed';
      const score =
        1000 -
        wordCountPenalty(variation.word_count, preferredBand) -
        pangramPenalty(variation.pangrams, preferredPangrams) -
        recentPenalty(letters, variation.center, recentRows) +
        qualityScore(grade);

      preliminary.push({
        letters,
        lettersKey,
        center: variation.center,
        variation,
        variations,
        grade,
        score,
      });
    }
  }

  const eligible = selectCandidatePool(preliminary, preferredBand, preferredPangrams)
    .sort((a, b) => b.score - a.score)
    .slice(0, PRELIMINARY_LIMIT);

  if (eligible.length === 0) return null;

  const activeSlots = await getActiveSlots(db);
  const previousSlot = activeSlots.length > 0 ? activeSlots[activeSlots.length - 1] : null;
  const nextSlot = activeSlots.length > 0 ? activeSlots[0] : null;

  const previousPuzzle =
    previousSlot !== null && previousSlot !== undefined
      ? await getPuzzleBySlot(db, previousSlot)
      : null;
  const nextPuzzle =
    nextSlot !== null && nextSlot !== undefined ? await getPuzzleBySlot(db, nextSlot) : null;

  const previousLetters = previousPuzzle
    ? Array.from(normalizeLettersKey(previousPuzzle.letters))
    : null;
  const nextLetters = nextPuzzle ? Array.from(normalizeLettersKey(nextPuzzle.letters)) : null;

  const previousShortWords =
    previousPuzzle && previousLetters
      ? shortWordSet(previousLetters, previousPuzzle.center, blockedWords)
      : null;
  const nextShortWords =
    nextPuzzle && nextLetters ? shortWordSet(nextLetters, nextPuzzle.center, blockedWords) : null;

  let best: AdminSuggestionResponse | null = null;
  let bestPangramsList: string[] = [];

  for (const candidate of eligible) {
    const candidateShorts = shortWordSet(candidate.letters, candidate.center, blockedWords);

    const previous = neighborOverlap(
      previousSlot ?? null,
      candidate.letters,
      candidateShorts,
      previousShortWords,
      previousLetters,
    );
    const next = neighborOverlap(
      nextSlot ?? null,
      candidate.letters,
      candidateShorts,
      nextShortWords,
      nextLetters,
    );

    const finalScore =
      candidate.score -
      (previous.shared_short_words + next.shared_short_words) * 34 -
      Math.max(0, previous.shared_letters - 3) * 14 -
      Math.max(0, next.shared_letters - 3) * 14;

    const suggestion: AdminSuggestionResponse = {
      letters: candidate.letters,
      letters_key: candidate.lettersKey,
      center: candidate.center,
      word_count: candidate.variation.word_count,
      pangram_count: candidate.variation.pangrams,
      max_score: candidate.variation.max_score,
      quality_grade: candidate.grade,
      quality_label: qualityLabel(candidate.grade),
      score: Math.round(finalScore),
      overlaps: {
        previous,
        next,
      },
      variations: candidate.variations,
      reasons: [],
    };
    suggestion.reasons = candidateReasons(suggestion, preferredBand, preferredPangrams);

    if (!best || suggestion.score > best.score) {
      best = suggestion;
      if (includePangrams) {
        const words = puzzleWords(candidate.letters, candidate.center, blockedWords, {
          pangramOnly: true,
        });
        bestPangramsList = words;
      }
    }
  }

  if (best && blockedWords.length > 0) {
    // Recompute actual totals filtering out blocked words
    const computed = computePuzzle(best.letters, best.center, blockedWords);
    best.word_count = computed.hint_data.word_count;
    best.pangram_count = computed.hint_data.pangram_count;
    best.max_score = computed.max_score;
    best.reasons = candidateReasons(best, preferredBand, preferredPangrams);
  }

  if (best && includePangrams) {
    best.pangrams = bestPangramsList;
  }

  return best;
}
