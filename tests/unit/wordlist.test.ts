import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bumpPuzzleCacheGeneration,
  computePuzzle,
  computeVariations,
  DEFAULT_SEED_WORDS,
  FINNISH_LETTERS,
  getCachedPuzzle,
  getPuzzleCacheGeneration,
  getWordlist,
  hashWord,
  invalidatePuzzleCache,
  isPangram,
  loadWordlist,
  MIN_WORD_LENGTH,
  normalizeWord,
  puzzleWords,
  scoreWord,
  setCachedPuzzle,
  setWordlist,
  type FullPuzzleData,
} from '../../packages/server/src/features/puzzle/wordlist.js';

describe('wordlist engine (unit)', () => {
  const letters = 'a,e,i,k,l,n,s';
  const center = 'a';

  beforeEach(() => {
    setWordlist([
      'Kana',
      'aika',
      'lähi-itä',
      'lasi',
      'sana',
      'kansa',
      'kansallinen',
      'kone',
      'ala',
      'kalvo',
      '123invalid',
      'hello!',
    ]);
  });

  afterEach(() => {
    setWordlist(DEFAULT_SEED_WORDS);
    invalidatePuzzleCache();
  });

  it('defines the 29-letter Finnish alphabet and minimum word length of 4', () => {
    expect(MIN_WORD_LENGTH).toBe(4);
    expect(FINNISH_LETTERS.size).toBe(29);
    expect(FINNISH_LETTERS.has('ä')).toBe(true);
    expect(FINNISH_LETTERS.has('ö')).toBe(true);
    expect(FINNISH_LETTERS.has('å')).toBe(true);
  });

  it('normalizes words by lowercasing, stripping hyphens, and filtering non-Finnish tokens', () => {
    expect(normalizeWord('  Lähi-Itä  ')).toBe('lähiitä');

    const loaded = getWordlist();
    expect(loaded.has('kana')).toBe(true);
    expect(loaded.has('lähiitä')).toBe(true);
    expect(loaded.has('123invalid')).toBe(false);
    expect(loaded.has('hello!')).toBe(false);
  });

  it('loads and normalizes a wordlist file from disk via loadWordlist()', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanakenno-wordlist-'));
    const tmpFile = path.join(tmpDir, 'kotus_test.txt');
    fs.writeFileSync(tmpFile, 'Kansallinen\nlähi-itä\nkala-auto\n12345\n', 'utf8');

    try {
      const words = loadWordlist(tmpFile);
      expect(words.has('kansallinen')).toBe(true);
      expect(words.has('lähiitä')).toBe(true);
      expect(words.has('kalaauto')).toBe(true);
      expect(words.has('12345')).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns an empty set when loadWordlist points to a non-existent file', () => {
    const words = loadWordlist('/tmp/non-existent-sanakenno-wordlist-file.txt');
    expect(words.size).toBe(0);
  });

  it('computes SHA-256 hex digests via hashWord()', () => {
    const expected = createHash('sha256').update('kansallinen').digest('hex');
    expect(hashWord('kansallinen')).toBe(expected);
    expect(hashWord('kansallinen')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashWord('kana')).not.toBe(hashWord('sana'));
  });

  it('detects 7-letter pangrams and awards +7 pangram bonus', () => {
    const letterSet = new Set(letters.split(','));
    expect(isPangram('kansallinen', letterSet)).toBe(true);
    expect(isPangram('kansa', letterSet)).toBe(false);

    expect(scoreWord('kana', letterSet)).toBe(1);
    expect(scoreWord('kansa', letterSet)).toBe(5);
    expect(scoreWord('kansallinen', letterSet)).toBe(11 + 7);
  });

  it('filters puzzleWords by length >= 4, center letter, allowed letters, and blocked words', () => {
    const words = puzzleWords(letters, center, ['sana']);
    expect(words).toEqual(['aika', 'kansa', 'kansallinen', 'kana', 'lasi'].sort());
    expect(words).not.toContain('ala'); // < 4 letters
    expect(words).not.toContain('kone'); // missing center 'a' and has 'o'
    expect(words).not.toContain('kalvo'); // 'v', 'o' not in letter set
    expect(words).not.toContain('sana'); // blocked
  });

  it('supports minLength, maxLength, and pangramOnly options in puzzleWords()', () => {
    expect(puzzleWords(letters, center, [], { minLength: 5, maxLength: 5 })).toEqual(['kansa']);
    expect(puzzleWords(letters, center, [], { pangramOnly: true })).toEqual(['kansallinen']);
  });

  it('computes full puzzle data including word_hashes, max_score, and hint_data', () => {
    const result = computePuzzle(letters, center);
    expect(result.words).toEqual(['aika', 'kana', 'kansa', 'kansallinen', 'lasi', 'sana']);
    expect(result.word_hashes).toHaveLength(result.words.length);

    for (let i = 0; i < result.words.length; i++) {
      const word = result.words[i]!;
      expect(result.word_hashes[i]).toBe(hashWord(word));
    }

    // Scores: aika(1) + kana(1) + kansa(5) + kansallinen(18) + lasi(1) + sana(1) = 27
    expect(result.max_score).toBe(27);
    expect(result.hint_data.word_count).toBe(6);
    expect(result.hint_data.pangram_count).toBe(1);
    expect(result.hint_data.by_letter).toEqual({ a: 1, k: 3, l: 1, s: 1 });
    expect(result.hint_data.by_length).toEqual({ '4': 4, '5': 1, '11': 1 });
    expect(result.hint_data.by_pair).toEqual({ ai: 1, ka: 3, la: 1, sa: 1 });
  });

  it('computes stats for all 7 center variations via computeVariations()', () => {
    const variations = computeVariations(letters);
    expect(variations).toHaveLength(7);
    expect(variations.map((v) => v.center)).toEqual(['a', 'e', 'i', 'k', 'l', 'n', 's']);

    const centerA = variations.find((v) => v.center === 'a');
    expect(centerA).toEqual({
      center: 'a',
      word_count: 6,
      max_score: 27,
      pangram_count: 1,
    });

    const centerE = variations.find((v) => v.center === 'e');
    expect(centerE).toEqual({
      center: 'e',
      word_count: 1, // only 'kansallinen' contains 'e' among valid words
      max_score: 18,
      pangram_count: 1,
    });
  });

  it('manages slot cache and invalidates per-slot or via generation bump', () => {
    const sample: FullPuzzleData = {
      center: 'a',
      letters: ['e', 'i', 'k', 'l', 'n', 's'],
      all_letters: letters,
      slot: 1,
      display_number: 1,
      total_puzzles: 2,
      ...computePuzzle(letters, center),
    };

    setCachedPuzzle(1, sample);
    setCachedPuzzle(2, { ...sample, slot: 2, display_number: 2 });
    expect(getCachedPuzzle(1)).toEqual(sample);
    expect(getCachedPuzzle(2)?.slot).toBe(2);

    invalidatePuzzleCache(1);
    expect(getCachedPuzzle(1)).toBeUndefined();
    expect(getCachedPuzzle(2)?.slot).toBe(2);

    const prevGen = getPuzzleCacheGeneration();
    const nextGen = bumpPuzzleCacheGeneration();
    expect(nextGen).toBe(prevGen + 1);
    expect(getCachedPuzzle(2)).toBeUndefined();
  });
});
