/**
 * Pure hint data derivation logic.
 *
 * Computes remaining-word statistics by starting letter, word length,
 * 2D letter x length matrix, unfound pangram details, and morphological suffixes.
 */

export interface HintPangramDetail {
  length: number;
  first_letter: string;
}

export interface HintData {
  word_count: number;
  pangram_count: number;
  by_letter: Record<string, number>;
  by_length: Record<string, number>;
  by_pair?: Record<string, number>;
  matrix?: Record<string, Record<string, number>>;
  pangram_details?: HintPangramDetail[];
  suffixes?: Record<string, number>;
}

export interface LetterEntry {
  letter: string;
  total: number;
  found: number;
  remaining: number;
  isComplete: boolean;
}

export interface LengthEntry {
  len: number;
  total: number;
  found: number;
  remaining: number;
}

export interface PairEntry {
  pair: string;
  total: number;
  found: number;
  remaining: number;
}

export interface PangramStats {
  total: number;
  found: number;
  remaining: number;
}

export interface SuffixEntry {
  suffix: string;
  total: number;
  found: number;
  remaining: number;
}

export interface MatrixCell {
  total: number;
  found: number;
  remaining: number;
}

export interface HintMatrix {
  letters: string[];
  lengths: number[];
  cells: Record<string, Record<number, MatrixCell>>;
  totalsByLetter: Record<string, number>;
  totalsByLength: Record<number, number>;
}

export interface DerivedHintData {
  wordCount: number;
  wordsFound: number;
  wordsRemaining: number;
  letterMap: LetterEntry[];
  lengthDistribution: LengthEntry[];
  pairMap: PairEntry[];
  pangramStats: PangramStats;
  unfoundPangrams: HintPangramDetail[];
  matrix: HintMatrix;
  suffixMap: SuffixEntry[];
}

/**
 * Deterministic Finnish alphabetical order: ...x y z å ä ö.
 */
const FINNISH_ALPHABET = 'abcdefghijklmnopqrstuvwxyzåäö';
const FINNISH_SORT_ORDER = new Map([...FINNISH_ALPHABET].map((char, index) => [char, index]));

export const FINNISH_SUFFIX_CANDIDATES = [
  'llinen',
  'lainen',
  'läinen',
  'maton',
  'mätön',
  'minen',
  'inen',
  'ton',
  'tön',
  'kas',
  'käs',
  'kko',
  'kkö',
  'sto',
  'stö',
  'sti',
  'lla',
  'llä',
  'tta',
  'ttä',
  'va',
  'vä',
  'nut',
  'nyt',
  'tu',
  'ty',
  'us',
  'ys',
  'os',
] as const;

export function normalizeFinnishText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('fi');
}

export function matchSuffix(word: string): string | null {
  const normalized = normalizeFinnishText(word);
  for (const suffix of FINNISH_SUFFIX_CANDIDATES) {
    if (normalized.length >= suffix.length + 2 && normalized.endsWith(suffix)) {
      return suffix;
    }
  }
  return null;
}

function finnishSortWeight(char: string): number {
  const knownIndex = FINNISH_SORT_ORDER.get(char);
  if (knownIndex !== undefined) {
    return knownIndex;
  }
  return FINNISH_ALPHABET.length + (char.codePointAt(0) ?? 0);
}

export function compareFinnishAlphabetically(a: string, b: string): number {
  const left = Array.from(normalizeFinnishText(a));
  const right = Array.from(normalizeFinnishText(b));
  const maxLen = Math.max(left.length, right.length);

  for (let i = 0; i < maxLen; i++) {
    const leftChar = left[i];
    const rightChar = right[i];

    if (leftChar === undefined) return -1;
    if (rightChar === undefined) return 1;

    const diff = finnishSortWeight(leftChar) - finnishSortWeight(rightChar);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function countByLetter(foundWords: Set<string>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const word of foundWords) {
    const normalizedWord = normalizeFinnishText(word);
    const l = Array.from(normalizedWord)[0];
    if (!l) continue;
    map[l] = (map[l] ?? 0) + 1;
  }
  return map;
}

function countByLength(foundWords: Set<string>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const word of foundWords) {
    const k = String(word.length);
    map[k] = (map[k] ?? 0) + 1;
  }
  return map;
}

function countByPair(foundWords: Set<string>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const word of foundWords) {
    const normalizedWord = normalizeFinnishText(word);
    const pair = Array.from(normalizedWord).slice(0, 2).join('');
    if (pair.length === 0) continue;
    map[pair] = (map[pair] ?? 0) + 1;
  }
  return map;
}

function getFoundPangrams(foundWords: Set<string>, allLetters: Set<string>): string[] {
  const pangrams: string[] = [];
  for (const word of foundWords) {
    let isP = true;
    for (const c of allLetters) {
      if (!word.includes(c)) {
        isP = false;
        break;
      }
    }
    if (isP) pangrams.push(normalizeFinnishText(word));
  }
  return pangrams;
}

/**
 * Compute all derived hint data from puzzle hint_data and found words.
 */
export function deriveHintData(
  hintData: HintData,
  foundWords: Set<string>,
  allLetters: Set<string>,
): DerivedHintData {
  const foundByLetter = countByLetter(foundWords);
  const foundByLen = countByLength(foundWords);
  const foundByPair = countByPair(foundWords);

  const letterMap: LetterEntry[] = Object.entries(hintData.by_letter)
    .map(([letter, total]) => {
      const found = foundByLetter[normalizeFinnishText(letter)] ?? 0;
      const remaining = Math.max(0, total - found);
      return {
        letter,
        total,
        found,
        remaining,
        isComplete: remaining === 0,
      };
    })
    .sort((a, b) => compareFinnishAlphabetically(a.letter, b.letter));

  const lengthDistribution: LengthEntry[] = Object.entries(hintData.by_length)
    .map(([len, total]) => {
      const found = foundByLen[len] ?? 0;
      return { len: parseInt(len, 10), total, found, remaining: Math.max(0, total - found) };
    })
    .sort((a, b) => a.len - b.len);

  const pairMap: PairEntry[] = Object.entries(hintData.by_pair ?? {})
    .map(([pair, total]) => {
      const found = foundByPair[normalizeFinnishText(pair)] ?? 0;
      return { pair, total, found, remaining: Math.max(0, total - found) };
    })
    .sort((a, b) => compareFinnishAlphabetically(a.pair, b.pair));

  const foundPangrams = getFoundPangrams(foundWords, allLetters);
  const pangramStats: PangramStats = {
    total: hintData.pangram_count,
    found: foundPangrams.length,
    remaining: Math.max(0, hintData.pangram_count - foundPangrams.length),
  };

  // Derive remaining unfound pangram clues
  const unfoundPangrams: HintPangramDetail[] = [];
  if (hintData.pangram_details && hintData.pangram_details.length > 0) {
    const available = [...hintData.pangram_details];
    for (const fp of foundPangrams) {
      const fLetter = fp[0] ?? '';
      const fLen = fp.length;
      const matchIdx = available.findIndex((p) => p.first_letter === fLetter && p.length === fLen);
      if (matchIdx !== -1) {
        available.splice(matchIdx, 1);
      }
    }
    unfoundPangrams.push(...available);
  }

  // Derive Matrix (letter x length)
  const matrixLetters = letterMap.map((l) => l.letter);
  const matrixLengths = lengthDistribution.map((l) => l.len);
  const matrixCells: Record<string, Record<number, MatrixCell>> = {};
  const matrixTotalsByLetter: Record<string, number> = {};
  const matrixTotalsByLength: Record<number, number> = {};

  for (const l of matrixLetters) {
    matrixCells[l] = {};
    matrixTotalsByLetter[l] = 0;
  }
  for (const len of matrixLengths) {
    matrixTotalsByLength[len] = 0;
  }

  // Count found words by (firstLetter, length)
  const foundByLetterAndLen: Record<string, Record<number, number>> = {};
  for (const word of foundWords) {
    const norm = normalizeFinnishText(word);
    const fl = norm[0];
    const len = norm.length;
    if (!fl) continue;
    const letterEntry = foundByLetterAndLen[fl] ?? (foundByLetterAndLen[fl] = {});
    letterEntry[len] = (letterEntry[len] ?? 0) + 1;
  }

  for (const l of matrixLetters) {
    const letterTotals = hintData.matrix?.[l] ?? {};
    const row = matrixCells[l] ?? (matrixCells[l] = {});
    for (const len of matrixLengths) {
      const total = letterTotals[String(len)] ?? 0;
      const found = foundByLetterAndLen[l]?.[len] ?? 0;
      const remaining = Math.max(0, total - found);
      row[len] = { total, found, remaining };
      matrixTotalsByLetter[l] = (matrixTotalsByLetter[l] ?? 0) + remaining;
      matrixTotalsByLength[len] = (matrixTotalsByLength[len] ?? 0) + remaining;
    }
  }

  // Derive Suffix breakdown
  const foundBySuffix: Record<string, number> = {};
  for (const word of foundWords) {
    const s = matchSuffix(word);
    if (s) {
      foundBySuffix[s] = (foundBySuffix[s] ?? 0) + 1;
    }
  }

  const suffixMap: SuffixEntry[] = Object.entries(hintData.suffixes ?? {})
    .map(([suffix, total]) => {
      const found = foundBySuffix[suffix] ?? 0;
      const remaining = Math.max(0, total - found);
      return { suffix, total, found, remaining };
    })
    .sort((a, b) => b.remaining - a.remaining || compareFinnishAlphabetically(a.suffix, b.suffix));

  return {
    wordCount: hintData.word_count,
    wordsFound: foundWords.size,
    wordsRemaining: Math.max(0, hintData.word_count - foundWords.size),
    letterMap,
    lengthDistribution,
    pairMap,
    pangramStats,
    unfoundPangrams,
    matrix: {
      letters: matrixLetters,
      lengths: matrixLengths,
      cells: matrixCells,
      totalsByLetter: matrixTotalsByLetter,
      totalsByLength: matrixTotalsByLength,
    },
    suffixMap,
  };
}
