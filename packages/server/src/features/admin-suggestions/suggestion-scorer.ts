import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AdminCombinationVariation,
  AdminSuggestionOverlap,
  AdminSuggestionResponse,
  PangramQualityGrade,
  SuggestionQualityGrade,
} from '@sanakenno/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUALITY_PATH = join(__dirname, '..', '..', '..', 'assets', 'pangram-quality.json');

export interface WordCountBand {
  id: 'short' | 'regular' | 'open' | 'long';
  label: string;
  min: number;
  max: number;
  target: number;
}

export interface SuggestionTarget {
  wordBand: WordCountBand['id'];
  pangrams: number;
}

export const WORD_COUNT_BANDS: WordCountBand[] = [
  { id: 'short', label: 'lyhyt', min: 18, max: 27, target: 23 },
  { id: 'regular', label: 'tavallinen', min: 28, max: 39, target: 34 },
  { id: 'open', label: 'runsas', min: 40, max: 55, target: 46 },
  { id: 'long', label: 'pitkä', min: 56, max: 80, target: 64 },
];

export const WORD_COUNT_BAND_BY_ID = new Map(WORD_COUNT_BANDS.map((band) => [band.id, band]));

export const SUGGESTION_TARGET_SEQUENCE: SuggestionTarget[] = [
  { wordBand: 'regular', pangrams: 1 },
  { wordBand: 'open', pangrams: 2 },
  { wordBand: 'short', pangrams: 1 },
  { wordBand: 'regular', pangrams: 3 },
  { wordBand: 'open', pangrams: 1 },
  { wordBand: 'regular', pangrams: 2 },
  { wordBand: 'long', pangrams: 4 },
  { wordBand: 'regular', pangrams: 1 },
  { wordBand: 'open', pangrams: 2 },
  { wordBand: 'short', pangrams: 3 },
  { wordBand: 'regular', pangrams: 1 },
  { wordBand: 'open', pangrams: 4 },
  { wordBand: 'regular', pangrams: 2 },
  { wordBand: 'long', pangrams: 5 },
];

let qualityOverride: Record<string, PangramQualityGrade> | null = null;
let cachedCuratedQuality: Record<string, PangramQualityGrade> | null = null;

export function setSuggestionQualityForTesting(
  quality: Record<string, PangramQualityGrade> | null,
): void {
  qualityOverride = quality;
  cachedCuratedQuality = null;
}

export function loadCuratedPangramQuality(): Record<string, PangramQualityGrade> {
  if (qualityOverride) return qualityOverride;
  if (cachedCuratedQuality) return cachedCuratedQuality;
  if (!existsSync(QUALITY_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(QUALITY_PATH, 'utf-8')) as {
      grades?: Record<string, PangramQualityGrade>;
    };
    cachedCuratedQuality = raw.grades ?? {};
    return cachedCuratedQuality;
  } catch {
    return {};
  }
}

export function normalizeLettersKey(letters: string | string[]): string {
  const chars = Array.isArray(letters)
    ? letters.flatMap((l) => Array.from(l.toLowerCase().trim()))
    : Array.from(letters.toLowerCase().replace(/[^a-zåäö]/g, ''));
  return Array.from(new Set(chars)).sort().join('');
}

export function suggestionKey(letters: string | string[], center: string): string {
  return `${normalizeLettersKey(letters)}:${center.trim().toLowerCase()}`;
}

export function qualityLabel(grade: SuggestionQualityGrade): string {
  switch (grade) {
    case 'good':
      return 'Hyvä pangrammilaatu';
    case 'ok':
      return 'Ok pangrammilaatu';
    case 'risky':
      return 'Riskialtis pangrammilaatu';
    default:
      return 'Ei arvioitu';
  }
}

export function wordCountBandFor(wordCount: number): WordCountBand {
  return (
    WORD_COUNT_BANDS.find((band) => wordCount >= band.min && wordCount <= band.max) ??
    (wordCount < WORD_COUNT_BANDS[0]!.min
      ? WORD_COUNT_BANDS[0]!
      : WORD_COUNT_BANDS[WORD_COUNT_BANDS.length - 1]!)
  );
}

export function preferredSuggestionTarget(total: number, declinedCount: number): SuggestionTarget {
  return SUGGESTION_TARGET_SEQUENCE[(total + declinedCount) % SUGGESTION_TARGET_SEQUENCE.length]!;
}

export function preferredWordCountBand(target: SuggestionTarget): WordCountBand {
  return WORD_COUNT_BAND_BY_ID.get(target.wordBand) ?? WORD_COUNT_BANDS[1]!;
}

export function wordCountPenalty(wordCount: number, preferred: WordCountBand): number {
  if (wordCount >= preferred.min && wordCount <= preferred.max) {
    return Math.abs(wordCount - preferred.target) * 2;
  }
  const distance =
    wordCount < preferred.min ? preferred.min - wordCount : wordCount - preferred.max;
  return 70 + distance * 6;
}

export function pangramPenalty(count: number, preferred: number): number {
  if (count === preferred) return 0;
  const distance = Math.abs(count - preferred);
  const onePangramPenalty = preferred > 1 && count === 1 ? 18 : 0;
  return 38 + distance * 12 + onePangramPenalty;
}

export function qualityScore(grade: SuggestionQualityGrade): number {
  switch (grade) {
    case 'good':
      return 35;
    case 'ok':
      return 15;
    case 'risky':
      return -80;
    default:
      return -10;
  }
}

export function recentPenalty(
  letters: string[],
  center: string,
  recent: Array<{ letters: string; center: string }>,
): number {
  const letterCounts = new Map<string, number>();
  let centerCount = 0;

  for (const row of recent) {
    if (row.center === center) centerCount++;
    for (const letter of Array.from(normalizeLettersKey(row.letters))) {
      letterCounts.set(letter, (letterCounts.get(letter) ?? 0) + 1);
    }
  }

  const letterPenalty = letters.reduce((sum, letter) => {
    const count = letterCounts.get(letter) ?? 0;
    return sum + Math.max(0, count - 2) * 4;
  }, 0);

  return letterPenalty + centerCount * 8;
}

export function intersectCount<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const value of a) {
    if (b.has(value)) count++;
  }
  return count;
}

export function letterOverlap(letters: string[], otherLetters: string[] | null): number {
  if (!otherLetters) return 0;
  return intersectCount(new Set(letters), new Set(otherLetters));
}

export function neighborOverlap(
  slot: number | null,
  letters: string[],
  candidateShortWords: Set<string>,
  neighborShortWords: Set<string> | null,
  neighborLetters: string[] | null,
): AdminSuggestionOverlap {
  return {
    slot,
    shared_letters: letterOverlap(letters, neighborLetters),
    shared_short_words: neighborShortWords
      ? intersectCount(candidateShortWords, neighborShortWords)
      : 0,
  };
}

export function candidateReasons(
  candidate: AdminSuggestionResponse,
  preferredBand: WordCountBand,
  preferredPangramCount: number,
): string[] {
  const reasons: string[] = [];
  const actualBand = wordCountBandFor(candidate.word_count);
  reasons.push(
    actualBand.id === preferredBand.id
      ? `sanamäärä tuo vaihtelua (${actualBand.label})`
      : `sanamäärä poikkeaa vaihtelutavoitteesta (${actualBand.label})`,
  );
  reasons.push(
    candidate.pangram_count === preferredPangramCount
      ? `${candidate.pangram_count} pangrammia osuu vaihteluun`
      : `${candidate.pangram_count} pangrammia`,
  );
  reasons.push(candidate.quality_label);
  reasons.push(
    `lyhyiden sanojen naapuri-osumat ${candidate.overlaps.previous.shared_short_words} + ${candidate.overlaps.next.shared_short_words}`,
  );
  return reasons;
}

export interface PreliminaryCandidate {
  letters: string[];
  lettersKey: string;
  center: string;
  variation: AdminCombinationVariation;
  variations: AdminCombinationVariation[];
  grade: SuggestionQualityGrade;
  score: number;
}

export function selectCandidatePool(
  candidates: PreliminaryCandidate[],
  preferredBand: WordCountBand,
  preferredPangramCount: number,
): PreliminaryCandidate[] {
  const rankedPools = [
    candidates.filter((c) => c.grade === 'good' || c.grade === 'ok'),
    candidates.filter((c) => c.grade === 'risky'),
    candidates.filter((c) => c.grade === 'unreviewed'),
  ];

  for (const pool of rankedPools) {
    if (pool.length === 0) continue;

    const preferred = pool.filter(
      (c) =>
        c.variation.word_count >= preferredBand.min && c.variation.word_count <= preferredBand.max,
    );
    const preferredWithPangrams = preferred.filter(
      (c) => c.variation.pangrams === preferredPangramCount,
    );
    if (preferredWithPangrams.length > 0) return preferredWithPangrams;
    if (preferred.length > 0) return preferred;

    const pangramPreferred = pool.filter((c) => c.variation.pangrams === preferredPangramCount);
    if (pangramPreferred.length > 0) return pangramPreferred;
    return pool;
  }

  return candidates;
}
