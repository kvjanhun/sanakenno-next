/**
 * Pure hint data derivation logic.
 *
 * Computes remaining-word statistics by starting letter, word length,
 * and two-letter prefix — comparing puzzle hint_data totals against
 * found words.
 */

export interface HintData {
  word_count: number;
  pangram_count: number;
  by_letter: Record<string, number>;
  by_length: Record<string, number>;
  by_pair: Record<string, number>;
}

export interface LetterEntry {
  letter: string;
  total: number;
  found: number;
  remaining: number;
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

export interface DerivedHintData {
  wordCount: number;
  wordsFound: number;
  wordsRemaining: number;
  letterMap: LetterEntry[];
  lengthDistribution: LengthEntry[];
  pairMap: PairEntry[];
  pangramStats: PangramStats;
}

/**
 * Deterministic Finnish alphabetical order: ...x y z å ä ö.
 */
const FINNISH_ALPHABET = 'abcdefghijklmnopqrstuvwxyzåäö';
const FINNISH_SORT_ORDER = new Map([...FINNISH_ALPHABET].map((char, index) => [char, index]));

function normalizeFinnishText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('fi');
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

function countFoundPangrams(foundWords: Set<string>, allLetters: Set<string>): number {
  let count = 0;
  for (const word of foundWords) {
    let isPangram = true;
    for (const c of allLetters) {
      if (!word.includes(c)) {
        isPangram = false;
        break;
      }
    }
    if (isPangram) count++;
  }
  return count;
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
      return { letter, total, found, remaining: total - found };
    })
    .sort((a, b) => compareFinnishAlphabetically(a.letter, b.letter));

  const lengthDistribution: LengthEntry[] = Object.entries(hintData.by_length)
    .map(([len, total]) => {
      const found = foundByLen[len] ?? 0;
      return { len: parseInt(len, 10), total, found, remaining: total - found };
    })
    .sort((a, b) => a.len - b.len);

  const pairMap: PairEntry[] = Object.entries(hintData.by_pair)
    .map(([pair, total]) => {
      const found = foundByPair[normalizeFinnishText(pair)] ?? 0;
      return { pair, total, found, remaining: total - found };
    })
    .sort((a, b) => compareFinnishAlphabetically(a.pair, b.pair));

  const foundPangrams = countFoundPangrams(foundWords, allLetters);
  const pangramStats: PangramStats = {
    total: hintData.pangram_count,
    found: foundPangrams,
    remaining: hintData.pangram_count - foundPangrams,
  };

  return {
    wordCount: hintData.word_count,
    wordsFound: foundWords.size,
    wordsRemaining: hintData.word_count - foundWords.size,
    letterMap,
    lengthDistribution,
    pairMap,
    pangramStats,
  };
}
