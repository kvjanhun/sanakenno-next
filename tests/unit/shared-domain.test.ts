import { describe, expect, it } from 'vitest';
import {
  buildKotusUrl,
  buildShareText,
  colorizeWord,
  compareFinnishAlphabetically,
  computeAverageCompletion,
  computeLifetimeNoHintStats,
  computeLifetimeStats,
  computeRankDistribution,
  computeStreak,
  deriveHintData,
  emptyStats,
  getHelsinkiDateString,
  getHoneycombCenterOverlayStops,
  getHoneycombCenterOverlayVariant,
  HintDataSchema,
  isPangram,
  isPuzzleStateBetterThanServer,
  isStatsRecordBetterThanServer,
  mergePuzzleState,
  mergeStatsRecord,
  noHintAchievementStates,
  PlayerStatsSchema,
  progressToNextRank,
  PuzzleStateSchema,
  rankForScore,
  rankIndex,
  rankThresholds,
  recalcScore,
  scoreWord,
  StatsRecordSchema,
  toColumns,
  updateStatsRecord,
  type HintData,
  type StatsRecord,
  type SyncPuzzleState,
} from '@sanakenno/shared';

describe('@sanakenno/shared — Pure Finnish Domain Logic', () => {
  const letters = new Set(['a', 'e', 'i', 'k', 'l', 'n', 's']);

  describe('scoring & pangrams', () => {
    it('scores 4-letter words as 1 point, 5+ letter words by length, and adds +7 for pangrams', () => {
      expect(scoreWord('kana', letters)).toBe(1);
      expect(scoreWord('kansa', letters)).toBe(5);
      expect(isPangram('kansallinen', letters)).toBe(true);
      expect(scoreWord('kansallinen', letters)).toBe(11 + 7);
      expect(recalcScore(['kana', 'kansa', 'kansallinen'], letters)).toBe(1 + 5 + 18);
    });

    it('resolves Finnish rank names, thresholds, and progress toward next rank', () => {
      expect(rankForScore(0, 100)).toBe('Etsi sanoja!');
      expect(rankForScore(2, 100)).toBe('Hyvä alku');
      expect(rankForScore(70, 100)).toBe('Ällistyttävä');
      expect(rankForScore(100, 100)).toBe('Täysi kenno');
      expect(rankForScore(0, 0)).toBe('Etsi sanoja!');

      const thresholds = rankThresholds('Hyvä alku', 100);
      expect(thresholds[0]).toEqual({ name: 'Etsi sanoja!', points: 0, isCurrent: false });
      expect(thresholds[1]).toEqual({ name: 'Hyvä alku', points: 2, isCurrent: true });
      expect(progressToNextRank(6, 100)).toBe(50);
      expect(progressToNextRank(100, 100)).toBe(100);
    });

    it('computes no-hint achievement unlock states, word colorization, and column chunking', () => {
      const states = noHintAchievementStates(50, 100);
      expect(states.map((s) => s.unlocked)).toEqual([true, true, false]);

      const colored = colorizeWord('ka-z', 'a', letters);
      expect(colored).toEqual([
        { char: 'k', color: 'primary' },
        { char: 'a', color: 'accent' },
        { char: '-', color: 'tertiary' },
        { char: 'z', color: 'tertiary' },
      ]);

      expect(toColumns([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('hint-data & Finnish alphabetical sorting', () => {
    it('sorts å, ä, ö after z in deterministic Finnish order and derives remaining counts', () => {
      expect(compareFinnishAlphabetically('z', 'å')).toBeLessThan(0);
      expect(compareFinnishAlphabetically('å', 'ä')).toBeLessThan(0);
      expect(compareFinnishAlphabetically('ä', 'ö')).toBeLessThan(0);

      const hintData: HintData = {
        word_count: 3,
        pangram_count: 1,
        by_letter: { ö: 1, a: 1, ä: 1 },
        by_length: { '4': 2, '11': 1 },
        by_pair: { ölj: 1, ai: 1, äi: 1 },
      };

      const derived = deriveHintData(hintData, new Set(['aika', 'kansallinen']), letters);
      expect(derived.letterMap.map((e) => e.letter)).toEqual(['a', 'ä', 'ö']);
      expect(derived.letterMap[0]?.remaining).toBe(0);
      expect(derived.pangramStats).toEqual({ total: 1, found: 1, remaining: 0 });
    });
  });

  describe('stats, streaks & Helsinki dates', () => {
    const rec1: StatsRecord = {
      puzzle_number: 1,
      date: '2026-10-25',
      best_rank: 'Onnistuja',
      best_score: 25,
      max_score: 100,
      words_found: 6,
      hints_used: 0,
      elapsed_ms: 12000,
      longest_word: 'kansa',
      pangrams_found: 0,
      best_no_hint_score: 25,
    };

    const rec2: StatsRecord = {
      puzzle_number: 2,
      date: '2026-10-26',
      best_rank: 'Ällistyttävä',
      best_score: 75,
      max_score: 100,
      words_found: 15,
      hints_used: 1,
      elapsed_ms: 30000,
      longest_word: 'kansallinen',
      pangrams_found: 1,
      best_no_hint_score: 70,
    };

    it('upserts stats monotonically and computes streaks, lifetime totals, and distributions', () => {
      expect(rankIndex('Täysi kenno')).toBeGreaterThan(rankIndex('Ällistyttävä'));

      let stats = emptyStats();
      stats = updateStatsRecord(stats, rec1);
      stats = updateStatsRecord(stats, {
        ...rec1,
        best_rank: 'Hyvä alku',
        best_score: 10,
        words_found: 8,
      });

      expect(stats.records[0]?.best_rank).toBe('Onnistuja');
      expect(stats.records[0]?.best_score).toBe(25);
      expect(stats.records[0]?.words_found).toBe(8);

      const streak = computeStreak([rec1, rec2], '2026-10-26');
      expect(streak).toEqual({ current: 2, best: 2 });

      expect(computeLifetimeStats([rec1, rec2])).toEqual({
        totalWords: 21,
        totalPangrams: 1,
        longestWord: 'kansallinen',
      });
      expect(computeLifetimeNoHintStats([rec1, rec2])).toEqual({
        highestPercentage: 70,
        topTierCount: 1,
      });
      expect(computeRankDistribution([rec1, rec2])).toEqual({
        Onnistuja: 1,
        Ällistyttävä: 1,
      });
      expect(computeAverageCompletion([rec1, rec2])).toBe(50);
      expect(getHelsinkiDateString(new Date('2026-06-15T22:30:00Z'))).toBe('2026-06-16');
    });
  });

  describe('sync-merge conflict resolution', () => {
    it('merges stats records and puzzle states without ever losing progress', () => {
      const localRec: StatsRecord = {
        puzzle_number: 5,
        date: '2026-10-27',
        best_rank: 'Sanavalmis',
        best_score: 45,
        max_score: 100,
        words_found: 10,
        hints_used: 0,
        elapsed_ms: 5000,
        longest_word: 'kuningas',
        pangrams_found: 1,
        best_no_hint_score: 45,
      };
      const serverRec: StatsRecord = {
        puzzle_number: 5,
        date: '2026-10-27',
        best_rank: 'Ällistyttävä',
        best_score: 72,
        max_score: 100,
        words_found: 14,
        hints_used: 2,
        elapsed_ms: 9000,
        longest_word: 'kansa',
        pangrams_found: 0,
        best_no_hint_score: 30,
      };

      const merged = mergeStatsRecord(localRec, serverRec);
      expect(merged.best_rank).toBe('Ällistyttävä');
      expect(merged.best_score).toBe(72);
      expect(merged.longest_word).toBe('kuningas');
      expect(merged.pangrams_found).toBe(1);
      expect(merged.best_no_hint_score).toBe(45);
      expect(isStatsRecordBetterThanServer(localRec, serverRec)).toBe(true);

      const localState: SyncPuzzleState = {
        puzzle_number: 5,
        found_words: ['kana', 'lasi'],
        score: 2,
        hints_unlocked: ['letters'],
        started_at: 1000,
        total_paused_ms: 200,
        score_before_hints: 1,
      };
      const serverState: SyncPuzzleState = {
        puzzle_number: 5,
        found_words: ['lasi', 'sana'],
        score: 2,
        hints_unlocked: ['lengths'],
        started_at: 2000,
        total_paused_ms: 500,
        score_before_hints: null,
      };

      const mergedState = mergePuzzleState(localState, serverState);
      expect(mergedState.found_words).toEqual(['kana', 'lasi', 'sana']);
      expect(mergedState.hints_unlocked).toEqual(['letters', 'lengths']);
      expect(mergedState.started_at).toBe(1000);
      expect(mergedState.total_paused_ms).toBe(500);
      expect(mergedState.score_before_hints).toBe(1);
      expect(isPuzzleStateBetterThanServer(localState, serverState)).toBe(true);
    });
  });

  describe('kotus, share-text, honeycomb-theme & Zod schemas', () => {
    it('builds Kotus dictionary URLs, share text, overlay stops, and validates Zod schemas', () => {
      expect(buildKotusUrl('äiti')).toBe('https://www.kielitoimistonsanakirja.fi/#/%C3%A4iti');

      const share = buildShareText({
        displayNumber: 42,
        score: 75,
        maxScore: 100,
        hintsUnlocked: new Set(['letters']),
        scoreBeforeHints: 50,
      });
      expect(share).toContain('Sanakenno — Kenno #42');
      expect(share).toContain('🏆 Ällistyttävä · 75/100 p.');
      expect(share).toContain('50% ilman apuja');

      expect(getHoneycombCenterOverlayVariant('mono', 'dark')).toBe('shadowy');
      expect(getHoneycombCenterOverlayVariant('hehku', 'dark')).toBe('glossy');
      expect(getHoneycombCenterOverlayStops('shadowy')).toHaveLength(3);

      expect(
        HintDataSchema.safeParse({
          word_count: 10,
          pangram_count: 1,
          by_letter: { a: 5 },
          by_length: { '4': 5 },
          by_pair: { aa: 2 },
        }).success,
      ).toBe(true);

      expect(
        StatsRecordSchema.safeParse({
          puzzle_number: 1,
          date: '2026-10-27',
          best_rank: 'Hyvä alku',
          best_score: 5,
          max_score: 50,
          words_found: 2,
          hints_used: 0,
          elapsed_ms: 1000,
        }).success,
      ).toBe(true);

      expect(PlayerStatsSchema.safeParse({ records: [], version: 1 }).success).toBe(true);
      expect(
        PuzzleStateSchema.safeParse({
          puzzle_number: 1,
          found_words: ['kana'],
          score: 1,
          hints_unlocked: [],
          started_at: 100,
          total_paused_ms: 0,
          score_before_hints: null,
        }).success,
      ).toBe(true);
    });
  });
});
