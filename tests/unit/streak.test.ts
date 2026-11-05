import { describe, expect, it } from 'vitest';
import {
  computeStreak,
  getHelsinkiDateString,
  isDailyRecord,
  updateStatsRecord,
  type PlayerStats,
  type StatsRecord,
} from '@sanakenno/shared';

function createRecord(overrides: Partial<StatsRecord> = {}): StatsRecord {
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
    played_at_date: '2026-11-05',
    ...overrides,
  };
}

describe('Streak Calculation & Daily Integrity', () => {
  it('increments current and updates best on consecutive daily plays', () => {
    const today = '2026-11-05';
    const day1 = createRecord({ puzzle_number: 101, date: '2026-11-03', is_daily: true });
    const day2 = createRecord({ puzzle_number: 102, date: '2026-11-04', is_daily: true });
    const day3 = createRecord({ puzzle_number: 103, date: '2026-11-05', is_daily: true });

    // 1 day
    expect(computeStreak([day1], '2026-11-03')).toEqual({ current: 1, best: 1 });
    // 2 days
    expect(computeStreak([day1, day2], '2026-11-04')).toEqual({ current: 2, best: 2 });
    // 3 days
    expect(computeStreak([day1, day2, day3], today)).toEqual({ current: 3, best: 3 });
  });

  it('resets current streak to 0 on a missed day and preserves historical best', () => {
    const day1 = createRecord({ puzzle_number: 101, date: '2026-11-01', is_daily: true });
    const day2 = createRecord({ puzzle_number: 102, date: '2026-11-02', is_daily: true });
    const day3 = createRecord({ puzzle_number: 103, date: '2026-11-03', is_daily: true });

    // On 2026-11-05, last played was 2026-11-03 (gap on 2026-11-04)
    const statsOnGapDay = computeStreak([day1, day2, day3], '2026-11-05');
    expect(statsOnGapDay).toEqual({ current: 0, best: 3 });

    // Playing on 2026-11-05 resumes current streak at 1, keeping best at 3
    const day5 = createRecord({ puzzle_number: 105, date: '2026-11-05', is_daily: true });
    const statsResumed = computeStreak([day1, day2, day3, day5], '2026-11-05');
    expect(statsResumed).toEqual({ current: 1, best: 3 });
  });

  it('isolates archive puzzles so they never increment current streak', () => {
    const today = '2026-11-05';
    // Player played today's daily
    const dailyToday = createRecord({ puzzle_number: 105, date: today, is_daily: true });

    // Player now opens an archive puzzle from yesterday, 1 week ago, and 1 month ago
    const archiveYesterday = createRecord({
      puzzle_number: 104,
      date: '2026-11-04',
      is_daily: false,
      played_at_date: today,
    });
    const archiveWeekAgo = createRecord({
      puzzle_number: 98,
      date: '2026-10-29',
      is_daily: false,
      played_at_date: today,
    });
    const archiveMonthAgo = createRecord({
      puzzle_number: 70,
      date: '2026-10-01',
      is_daily: false,
      played_at_date: today,
    });

    const records = [dailyToday, archiveYesterday, archiveWeekAgo, archiveMonthAgo];
    const streak = computeStreak(records, today);
    // current must be 1 (only dailyToday counts, archiveYesterday must not stitch into a 2-day streak)
    expect(streak.current).toBe(1);
    expect(streak.best).toBe(1);
  });

  it('isolates archive clusters so playing consecutive archive dates in one session never inflates best streak', () => {
    const today = '2026-11-05';
    // Player has no daily plays today, but solves 5 consecutive historical archive dates
    const archive1 = createRecord({
      puzzle_number: 50,
      date: '2026-09-01',
      is_daily: false,
      played_at_date: today,
    });
    const archive2 = createRecord({
      puzzle_number: 51,
      date: '2026-09-02',
      is_daily: false,
      played_at_date: today,
    });
    const archive3 = createRecord({
      puzzle_number: 52,
      date: '2026-09-03',
      is_daily: false,
      played_at_date: today,
    });
    const archive4 = createRecord({
      puzzle_number: 53,
      date: '2026-09-04',
      is_daily: false,
      played_at_date: today,
    });
    const archive5 = createRecord({
      puzzle_number: 54,
      date: '2026-09-05',
      is_daily: false,
      played_at_date: today,
    });

    const cluster = [archive1, archive2, archive3, archive4, archive5];
    const streak = computeStreak(cluster, today);
    expect(streak).toEqual({ current: 0, best: 0 });
  });

  it('correctly handles Helsinki date boundary and backwards compatibility', () => {
    const helsinkiToday = getHelsinkiDateString();
    expect(helsinkiToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // isDailyRecord checks
    expect(isDailyRecord(createRecord({ is_daily: true }))).toBe(true);
    expect(isDailyRecord(createRecord({ is_daily: false }))).toBe(false);

    // Legacy record without is_daily: if played_at_date matches date, daily
    expect(
      isDailyRecord(
        createRecord({ is_daily: undefined, date: '2026-03-01', played_at_date: '2026-03-01' }),
      ),
    ).toBe(true);
    // Legacy record played at later date (archive play)
    expect(
      isDailyRecord(
        createRecord({ is_daily: undefined, date: '2026-03-01', played_at_date: '2026-03-10' }),
      ),
    ).toBe(false);

    // updateStatsRecord merges is_daily monotonically
    const initialStats: PlayerStats = {
      version: 1,
      records: [createRecord({ puzzle_number: 10, is_daily: true })],
    };
    // Updating later via archive view preserves is_daily: true
    const updated = updateStatsRecord(
      initialStats,
      createRecord({ puzzle_number: 10, is_daily: false, best_score: 80 }),
    );
    expect(updated.records[0]?.is_daily).toBe(true);
    expect(updated.records[0]?.best_score).toBe(80);
  });
});
