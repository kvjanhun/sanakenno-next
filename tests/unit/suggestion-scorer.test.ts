import { afterEach, describe, expect, it } from 'vitest';
import {
  candidateReasons,
  letterOverlap,
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
  setSuggestionQualityForTesting,
  suggestionKey,
  WORD_COUNT_BANDS,
  wordCountBandFor,
  wordCountPenalty,
  type PreliminaryCandidate,
} from '../../packages/server/src/features/admin-suggestions/suggestion-scorer.js';

describe('Admin Suggestion Scorer (Pure Unit Tests)', () => {
  afterEach(() => {
    setSuggestionQualityForTesting(null);
  });

  describe('Key normalization and formatting', () => {
    it('normalizes letters to sorted, trimmed unique strings', () => {
      expect(normalizeLettersKey('k,a,n,s,a,l,i')).toBe('aiklns');
      expect(normalizeLettersKey(['S', 'A', 'N', 'A', 'K', 'E', 'N', 'N', 'O'])).toBe('aeknos');
      expect(suggestionKey('a,e,i,k,l,n,s', 'K')).toBe('aeiklns:k');
    });

    it('returns Finnish quality labels and reasons', () => {
      expect(qualityLabel('good')).toBe('Hyvä pangrammilaatu');
      expect(qualityLabel('ok')).toBe('Ok pangrammilaatu');
      expect(qualityLabel('risky')).toBe('Riskialtis pangrammilaatu');
      expect(qualityLabel('unreviewed')).toBe('Ei arvioitu');

      const regularBand = WORD_COUNT_BANDS.find((b) => b.id === 'regular')!;
      const reasons = candidateReasons(
        {
          letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
          letters_key: 'aeiklns',
          center: 'a',
          word_count: 34,
          pangram_count: 1,
          max_score: 100,
          quality_grade: 'good',
          quality_label: 'Hyvä pangrammilaatu',
          score: 800,
          overlaps: {
            previous: { slot: 1, shared_letters: 2, shared_short_words: 1 },
            next: { slot: 2, shared_letters: 1, shared_short_words: 0 },
          },
          variations: [],
          reasons: [],
        },
        regularBand,
        1,
      );
      expect(reasons).toHaveLength(4);
      expect(reasons[0]).toContain('sanamäärä tuo vaihtelua');
    });
  });

  describe('Word-band targets and penalty progression', () => {
    it('resolves correct word count bands for given counts', () => {
      expect(wordCountBandFor(20).id).toBe('short');
      expect(wordCountBandFor(34).id).toBe('regular');
      expect(wordCountBandFor(50).id).toBe('open');
      expect(wordCountBandFor(70).id).toBe('long');
    });

    it('cycles through target sequence based on total puzzles and declined count', () => {
      const target0 = preferredSuggestionTarget(0, 0);
      expect(target0.wordBand).toBe('regular');
      expect(target0.pangrams).toBe(1);

      const target1 = preferredSuggestionTarget(0, 1);
      expect(target1.wordBand).toBe('open');
      expect(target1.pangrams).toBe(2);

      const band1 = preferredWordCountBand(target1);
      expect(band1.id).toBe('open');
      expect(band1.target).toBe(46);
    });

    it('calculates word count penalty with target proximity and distance steps', () => {
      const regularBand = WORD_COUNT_BANDS.find((b) => b.id === 'regular')!;
      // Target is 34; distance of 0 gives 0 penalty
      expect(wordCountPenalty(34, regularBand)).toBe(0);
      // In-band distance of 2 (36 - 34) gives 2 * 2 = 4
      expect(wordCountPenalty(36, regularBand)).toBe(4);
      // Out of band (below 28) applies 70 + distance * 6
      // count 25: distance is 28 - 25 = 3 => 70 + 3 * 6 = 88
      expect(wordCountPenalty(25, regularBand)).toBe(88);
    });

    it('calculates pangram penalty favoring target pangram counts', () => {
      expect(pangramPenalty(2, 2)).toBe(0);
      // distance 1 gives 38 + 12 = 50
      expect(pangramPenalty(1, 2)).toBe(38 + 12 + 18); // 18 extra penalty when count=1 and preferred>1
      expect(pangramPenalty(3, 2)).toBe(38 + 12);
    });

    it('assigns quality scores reflecting editorial grades', () => {
      expect(qualityScore('good')).toBe(35);
      expect(qualityScore('ok')).toBe(15);
      expect(qualityScore('risky')).toBe(-80);
      expect(qualityScore('unreviewed')).toBe(-10);
    });
  });

  describe('Overlap penalties with recent and neighboring puzzles', () => {
    it('penalizes repeated letters and center repetition in recent puzzles', () => {
      const recent = [
        { letters: 'a,e,i,k,l,n,s', center: 'k' },
        { letters: 'e,h,i,k,n,o,s', center: 'k' },
      ];
      // center 'k' repeated twice gives centerCount (2) * 8 = 16
      const penalty = recentPenalty(['a', 'e', 'i', 'k', 'l', 'n', 's'], 'k', recent);
      expect(penalty).toBeGreaterThanOrEqual(16);
    });

    it('calculates letter and short-word overlaps between neighbors', () => {
      expect(letterOverlap(['a', 'b', 'c'], ['c', 'd', 'e'])).toBe(1);
      expect(letterOverlap(['a', 'b'], null)).toBe(0);

      const candidateShorts = new Set(['koti', 'kolo', 'kala']);
      const neighborShorts = new Set(['kala', 'kana', 'pala']);

      const overlap = neighborOverlap(1, ['a', 'k', 'l'], candidateShorts, neighborShorts, [
        'a',
        'k',
        'n',
      ]);
      expect(overlap.slot).toBe(1);
      expect(overlap.shared_letters).toBe(2);
      expect(overlap.shared_short_words).toBe(1); // 'kala'
    });
  });

  describe('Pangram quality grades and candidate pool selection', () => {
    it('loads curated pangram quality overrides for testing', () => {
      setSuggestionQualityForTesting({
        'aeiklns:a': 'good',
        'aeiklns:k': 'reject',
      });
      const grades = loadCuratedPangramQuality();
      expect(grades['aeiklns:a']).toBe('good');
      expect(grades['aeiklns:k']).toBe('reject');
    });

    it('filters candidate pools preferring higher quality grades and target bands', () => {
      const regularBand = WORD_COUNT_BANDS.find((b) => b.id === 'regular')!;

      const candidates: PreliminaryCandidate[] = [
        {
          letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
          lettersKey: 'aeiklns',
          center: 'a',
          variation: { center: 'a', word_count: 35, max_score: 120, pangrams: 1 },
          variations: [],
          grade: 'good',
          score: 850,
        },
        {
          letters: ['e', 'h', 'i', 'k', 'n', 'o', 's'],
          lettersKey: 'ehiknos',
          center: 'n',
          variation: { center: 'n', word_count: 50, max_score: 160, pangrams: 1 },
          variations: [],
          grade: 'risky',
          score: 600,
        },
      ];

      const pool = selectCandidatePool(candidates, regularBand, 1);
      expect(pool).toHaveLength(1);
      expect(pool[0]!.grade).toBe('good');
    });
  });
});
