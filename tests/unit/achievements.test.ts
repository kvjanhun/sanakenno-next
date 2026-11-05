import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_TIER_NAMES,
  evaluateAchievements,
  type PlayerStats,
  type StatsRecord,
} from '@sanakenno/shared';

function makeRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
  return {
    puzzle_number: 1,
    date: '2026-11-05',
    best_rank: 'Onnistuja',
    best_score: 50,
    max_score: 100,
    words_found: 10,
    hints_used: 0,
    elapsed_ms: 60000,
    is_daily: true,
    ...overrides,
  };
}

describe('Player Achievement Catalog & Evaluation', () => {
  it('verifies catalog completeness: exactly 6 categories with 5 tiers each (Pronssi, Hopea, Kulta, Timantti, Mestari)', () => {
    expect(ACHIEVEMENT_DEFINITIONS).toHaveLength(6);
    const expectedIds = [
      'streak',
      'total_words',
      'pangrams',
      'long_word',
      'full_board',
      'unassisted_master',
    ];
    expect(ACHIEVEMENT_DEFINITIONS.map((a) => a.id)).toEqual(expectedIds);

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      expect(def.tiers).toHaveLength(5);
      expect(def.tiers.map((t) => t.name)).toEqual(ACHIEVEMENT_TIER_NAMES);
      expect(def.tiers.map((t) => t.level)).toEqual([1, 2, 3, 4, 5]);
      // Ensure targets strictly increase
      for (let i = 1; i < def.tiers.length; i++) {
        expect(def.tiers[i]!.target).toBeGreaterThan(def.tiers[i - 1]!.target);
      }
    }
  });

  it('evaluates Streak Achievement at 7, 30, 60, 120, and 365 days', () => {
    const empty: PlayerStats = { version: 1, records: [] };

    expect(evaluateAchievements(empty, { current: 6, best: 6 })[0]?.unlockedTier).toBe(0);
    expect(evaluateAchievements(empty, { current: 7, best: 7 })[0]?.unlockedTier).toBe(1);
    expect(evaluateAchievements(empty, { current: 30, best: 30 })[0]?.unlockedTier).toBe(2);
    expect(evaluateAchievements(empty, { current: 60, best: 60 })[0]?.unlockedTier).toBe(3);
    expect(evaluateAchievements(empty, { current: 120, best: 120 })[0]?.unlockedTier).toBe(4);
    expect(evaluateAchievements(empty, { current: 365, best: 365 })[0]?.unlockedTier).toBe(5);
    expect(evaluateAchievements(empty, { current: 500, best: 500 })[0]?.isCompleted).toBe(true);
  });

  it('evaluates Total Words Achievement at 100, 500, 1000, 2500, and 5000 cumulative words', () => {
    const makeWordsStats = (count: number): PlayerStats => ({
      version: 1,
      records: [makeRecord({ words_found: count })],
    });

    const getWordsTier = (count: number) =>
      evaluateAchievements(makeWordsStats(count), { current: 0, best: 0 }).find(
        (a) => a.id === 'total_words',
      );

    expect(getWordsTier(99)?.unlockedTier).toBe(0);
    expect(getWordsTier(100)?.unlockedTier).toBe(1);
    expect(getWordsTier(500)?.unlockedTier).toBe(2);
    expect(getWordsTier(1000)?.unlockedTier).toBe(3);
    expect(getWordsTier(2500)?.unlockedTier).toBe(4);
    expect(getWordsTier(5000)?.unlockedTier).toBe(5);
    expect(getWordsTier(6000)?.isCompleted).toBe(true);
  });

  it('evaluates Pangrams Achievement at 7, 17, 77, 177, and 777 cumulative pangrams', () => {
    const makePangramStats = (count: number): PlayerStats => ({
      version: 1,
      records: [makeRecord({ pangrams_found: count })],
    });

    const getPangramTier = (count: number) =>
      evaluateAchievements(makePangramStats(count), { current: 0, best: 0 }).find(
        (a) => a.id === 'pangrams',
      );

    expect(getPangramTier(6)?.unlockedTier).toBe(0);
    expect(getPangramTier(7)?.unlockedTier).toBe(1);
    expect(getPangramTier(17)?.unlockedTier).toBe(2);
    expect(getPangramTier(77)?.unlockedTier).toBe(3);
    expect(getPangramTier(177)?.unlockedTier).toBe(4);
    expect(getPangramTier(777)?.unlockedTier).toBe(5);
  });

  it('evaluates Long Words Achievement at 5, 20, 50, 100, and 500 words length >= 10', () => {
    const makeLongWordsStats = (count: number): PlayerStats => ({
      version: 1,
      records: [makeRecord({ long_words_count: count })],
    });

    const getLongWordsTier = (count: number) =>
      evaluateAchievements(makeLongWordsStats(count), { current: 0, best: 0 }).find(
        (a) => a.id === 'long_word',
      );

    expect(getLongWordsTier(4)?.unlockedTier).toBe(0);
    expect(getLongWordsTier(5)?.unlockedTier).toBe(1);
    expect(getLongWordsTier(20)?.unlockedTier).toBe(2);
    expect(getLongWordsTier(50)?.unlockedTier).toBe(3);
    expect(getLongWordsTier(100)?.unlockedTier).toBe(4);
    expect(getLongWordsTier(500)?.unlockedTier).toBe(5);
  });

  it('evaluates Full Board Achievement at 2, 5, 10, 20, and 50 puzzles', () => {
    const makeFullBoards = (numBoards: number): PlayerStats => ({
      version: 1,
      records: Array.from({ length: numBoards }, (_, i) =>
        makeRecord({
          puzzle_number: i + 1,
          best_rank: 'Täysi kenno',
          best_score: 100,
          max_score: 100,
        }),
      ),
    });

    const getFullBoardTier = (numBoards: number) =>
      evaluateAchievements(makeFullBoards(numBoards), { current: 0, best: 0 }).find(
        (a) => a.id === 'full_board',
      );

    expect(getFullBoardTier(1)?.unlockedTier).toBe(0);
    expect(getFullBoardTier(2)?.unlockedTier).toBe(1);
    expect(getFullBoardTier(5)?.unlockedTier).toBe(2);
    expect(getFullBoardTier(10)?.unlockedTier).toBe(3);
    expect(getFullBoardTier(20)?.unlockedTier).toBe(4);
    expect(getFullBoardTier(50)?.unlockedTier).toBe(5);
  });

  it('evaluates Unassisted Achievement at 1, 3, 8, 15, and 25 puzzles reaching Ällistyttävä without hints', () => {
    const makeUnassisted = (numPuzzles: number): PlayerStats => ({
      version: 1,
      records: Array.from({ length: numPuzzles }, (_, i) =>
        makeRecord({
          puzzle_number: i + 1,
          best_rank: 'Ällistyttävä',
          best_score: 75,
          max_score: 100,
          hints_used: 0,
          best_no_hint_score: 75,
        }),
      ),
    });

    const getUnassistedTier = (numPuzzles: number) =>
      evaluateAchievements(makeUnassisted(numPuzzles), { current: 0, best: 0 }).find(
        (a) => a.id === 'unassisted_master',
      );

    expect(getUnassistedTier(0)?.unlockedTier).toBe(0);
    expect(getUnassistedTier(1)?.unlockedTier).toBe(1);
    expect(getUnassistedTier(3)?.unlockedTier).toBe(2);
    expect(getUnassistedTier(8)?.unlockedTier).toBe(3);
    expect(getUnassistedTier(15)?.unlockedTier).toBe(4);
    expect(getUnassistedTier(25)?.unlockedTier).toBe(5);
  });

  it('handles boundary & zero states: 0% progress toward Pronssi when empty, exact target unlocks tier', () => {
    const empty: PlayerStats = { version: 1, records: [] };
    const initial = evaluateAchievements(empty, { current: 0, best: 0 });

    for (const prog of initial) {
      expect(prog.unlockedTier).toBe(0);
      expect(prog.progressPct).toBe(0);
      expect(prog.currentTier).toBeNull();
      expect(prog.nextTier).not.toBeNull();
      expect(prog.nextTierTarget).toBe(prog.tiers[0]!.target);
    }
  });

  it('enforces monotonicity: never downgrades a tier even with mixed records', () => {
    const stats: PlayerStats = {
      version: 1,
      records: [
        makeRecord({ puzzle_number: 1, words_found: 100 }),
        makeRecord({ puzzle_number: 2, words_found: 20 }),
      ],
    };
    const eval1 = evaluateAchievements(stats, { current: 0, best: 0 }).find(
      (a) => a.id === 'total_words',
    );
    expect(eval1?.unlockedTier).toBe(1);

    // Adding record with 0 words does not reduce words found
    const stats2: PlayerStats = {
      version: 1,
      records: [...stats.records, makeRecord({ puzzle_number: 3, words_found: 0 })],
    };
    const eval2 = evaluateAchievements(stats2, { current: 0, best: 0 }).find(
      (a) => a.id === 'total_words',
    );
    expect(eval2?.unlockedTier).toBe(1);
  });
});
