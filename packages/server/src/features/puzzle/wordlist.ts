import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isPangram, scoreWord, type HintData } from '@sanakenno/shared';

export { isPangram, scoreWord, type HintData };

/** Valid Finnish alphabet letters for puzzle validation (a–ö, including å). */
export const FINNISH_LETTERS = new Set('abcdefghijklmnopqrstuvwxyzåäö'.split(''));

/** Minimum valid puzzle word length in Sanakenno. */
export const MIN_WORD_LENGTH = 4;

/** Fallback words covering seeded dev/test puzzles when kotus_words.txt is not loaded. */
export const DEFAULT_SEED_WORDS = [
  'kana',
  'aika',
  'lasi',
  'sana',
  'kala',
  'kansa',
  'sanka',
  'lakana',
  'kansallinen',
  'kenno',
  'onni',
  'kone',
  'hieno',
  'oksinen',
  'henkinen',
  'keinonen',
  'keskihieno',
];

export interface PuzzleData {
  words: string[];
  word_hashes: string[];
  max_score: number;
  hint_data: HintData;
}

export interface FullPuzzleData extends PuzzleData {
  center: string;
  letters: string[];
  all_letters: string;
  slot: number;
  display_number: number;
  total_puzzles: number;
}

export interface PuzzleWordFilterOptions {
  minLength?: number;
  maxLength?: number;
  pangramOnly?: boolean;
}

export interface VariationData {
  center: string;
  word_count: number;
  max_score: number;
  pangram_count: number;
}

let _allWords = new Set<string>();
let _wordlistLoaded = false;

const _puzzleCache = new Map<number, FullPuzzleData>();
let _cacheGeneration = 0;

/**
 * Normalize a raw candidate word by trimming, lowercasing, and stripping hyphens.
 */
export function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase().replaceAll('-', '');
}

function isFinnishAlphabetOnly(word: string): boolean {
  if (word.length === 0) return false;
  for (const ch of word) {
    if (!FINNISH_LETTERS.has(ch)) {
      return false;
    }
  }
  return true;
}

function resolveDefaultWordlistPath(): string | null {
  const candidates = [
    process.env.WORDLIST_PATH,
    process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'kotus_words.txt') : null,
    path.resolve(import.meta.dirname, '../../../assets/kotus_words.txt'),
    path.resolve(import.meta.dirname, '../../../data/kotus_words.txt'),
    '/data/kotus_words.txt',
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Load the Finnish wordlist from disk, lowercasing and stripping hyphens.
 */
export function loadWordlist(customPath?: string): Set<string> {
  const targetPath = customPath ?? resolveDefaultWordlistPath();
  if (!targetPath || !existsSync(targetPath)) {
    _allWords = new Set();
    _wordlistLoaded = true;
    invalidatePuzzleCache();
    return _allWords;
  }

  const content = readFileSync(targetPath, 'utf8');
  const words = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const normalized = normalizeWord(line);
    if (isFinnishAlphabetOnly(normalized)) {
      words.add(normalized);
    }
  }

  _allWords = words;
  _wordlistLoaded = true;
  invalidatePuzzleCache();
  return _allWords;
}

/**
 * Return the currently loaded in-memory wordlist.
 */
export function getWordlist(): Set<string> {
  return _allWords;
}

/**
 * Replace the in-memory wordlist (for testing and deterministic seeding).
 */
export function setWordlist(words: Iterable<string>): void {
  const normalized = new Set<string>();
  for (const raw of words) {
    const word = normalizeWord(raw);
    if (isFinnishAlphabetOnly(word)) {
      normalized.add(word);
    }
  }
  _allWords = normalized;
  _wordlistLoaded = true;
  invalidatePuzzleCache();
}

function ensureWordlist(): void {
  if (!_wordlistLoaded && _allWords.size === 0) {
    loadWordlist();
  }
}

function parseLettersList(letters: string | string[]): string[] {
  if (Array.isArray(letters)) {
    return letters.map((l) => l.trim().toLowerCase()).filter(Boolean);
  }
  const separator = letters.includes(',') ? ',' : '';
  return letters
    .split(separator)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Compute the lowercase SHA-256 hex digest of a word.
 */
export function hashWord(word: string): string {
  return createHash('sha256').update(word).digest('hex');
}

/**
 * Return valid sorted Finnish puzzle words for a letter set and center letter.
 */
export function puzzleWords(
  letters: string | string[],
  center: string,
  blockedWords: string[] = [],
  options: PuzzleWordFilterOptions = {},
): string[] {
  ensureWordlist();
  const letterList = parseLettersList(letters);
  const centerChar = center.trim().toLowerCase();
  const allLetterSet = new Set(letterList);
  const blockedSet = new Set(blockedWords.map((w) => normalizeWord(w)));
  const minLength = options.minLength ?? MIN_WORD_LENGTH;
  const maxLength = options.maxLength ?? Infinity;

  const matching: string[] = [];
  for (const word of _allWords) {
    if (blockedSet.has(word)) continue;
    if (word.length < minLength || word.length > maxLength) continue;
    if (!word.includes(centerChar)) continue;

    let allValid = true;
    for (const ch of word) {
      if (!FINNISH_LETTERS.has(ch) || !allLetterSet.has(ch)) {
        allValid = false;
        break;
      }
    }
    if (!allValid) continue;
    if (options.pangramOnly && !isPangram(word, allLetterSet)) continue;

    matching.push(word);
  }

  return matching.sort();
}

/**
 * Compute full puzzle word list, SHA-256 hashes, max score, and hint breakdown.
 */
export function computePuzzle(
  letters: string | string[],
  center: string,
  blockedWords: string[] = [],
): PuzzleData {
  const letterList = parseLettersList(letters);
  const allLetterSet = new Set(letterList);
  const words = puzzleWords(letterList, center, blockedWords);

  let maxScore = 0;
  let pangramCount = 0;
  const byLetter: Record<string, number> = {};
  const byLength: Record<string, number> = {};
  const byPair: Record<string, number> = {};

  for (const word of words) {
    maxScore += scoreWord(word, allLetterSet);
    if (isPangram(word, allLetterSet)) {
      pangramCount += 1;
    }

    const firstLetter = word[0];
    if (firstLetter) {
      byLetter[firstLetter] = (byLetter[firstLetter] ?? 0) + 1;
    }

    const lenKey = String(word.length);
    byLength[lenKey] = (byLength[lenKey] ?? 0) + 1;

    const pair = word.slice(0, 2);
    if (pair.length === 2) {
      byPair[pair] = (byPair[pair] ?? 0) + 1;
    }
  }

  return {
    words,
    word_hashes: words.map((w) => hashWord(w)),
    max_score: maxScore,
    hint_data: {
      word_count: words.length,
      pangram_count: pangramCount,
      by_letter: byLetter,
      by_length: byLength,
      by_pair: byPair,
    },
  };
}

/**
 * Compute stats for every center-letter variation of a 7-letter combination.
 */
export function computeVariations(
  letters: string | string[],
  blockedWords: string[] = [],
): VariationData[] {
  const letterList = parseLettersList(letters);
  return letterList.map((center) => {
    const result = computePuzzle(letterList, center, blockedWords);
    return {
      center,
      word_count: result.hint_data.word_count,
      max_score: result.max_score,
      pangram_count: result.hint_data.pangram_count,
    };
  });
}

/**
 * Read a cached full puzzle by slot if present in the current generation.
 */
export function getCachedPuzzle(slot: number): FullPuzzleData | undefined {
  return _puzzleCache.get(slot);
}

/**
 * Store a computed full puzzle in the slot cache.
 */
export function setCachedPuzzle(slot: number, data: FullPuzzleData): void {
  _puzzleCache.set(slot, data);
}

/**
 * Invalidate cached puzzle data for a single slot or all slots when omitted.
 */
export function invalidatePuzzleCache(slot?: number): void {
  if (slot !== undefined) {
    _puzzleCache.delete(slot);
    return;
  }
  _puzzleCache.clear();
}

/**
 * Bump the in-memory puzzle cache generation and clear all cached slot payloads.
 */
export function bumpPuzzleCacheGeneration(): number {
  _cacheGeneration += 1;
  _puzzleCache.clear();
  return _cacheGeneration;
}

/**
 * Return the current in-memory puzzle cache generation counter.
 */
export function getPuzzleCacheGeneration(): number {
  return _cacheGeneration;
}
