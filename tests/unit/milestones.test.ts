import { describe, expect, it } from 'vitest';
import {
  NO_HINT_MILESTONES,
  noHintMilestoneStates,
  type NoHintMilestone,
  type NoHintMilestoneState,
} from '@sanakenno/shared';

describe('No-Hint Milestones', () => {
  it('exports exactly 25%, 50%, and 70% tiers with Finnish milestone names', () => {
    expect(NO_HINT_MILESTONES).toHaveLength(3);
    expect(NO_HINT_MILESTONES[0]).toEqual<NoHintMilestone>({
      pct: 25,
      name: 'Omin avuin',
    });
    expect(NO_HINT_MILESTONES[1]).toEqual<NoHintMilestone>({
      pct: 50,
      name: 'Avuitta taitava',
    });
    expect(NO_HINT_MILESTONES[2]).toEqual<NoHintMilestone>({
      pct: 70,
      name: 'Ällistyttävä ilman apuja',
    });
  });

  it('calculates unlock flags correctly based on score thresholds and handles zero maxScore', () => {
    // 0 maxScore case
    const zeroStates = noHintMilestoneStates(50, 0);
    expect(zeroStates.every((s: NoHintMilestoneState) => !s.unlocked)).toBe(true);
    expect(zeroStates.every((s: NoHintMilestoneState) => s.points === 0)).toBe(true);

    // Max score = 100
    // 25% = 25 pts, 50% = 50 pts, 70% = 70 pts
    const noneUnlocked = noHintMilestoneStates(24, 100);
    expect(noneUnlocked.map((s) => s.unlocked)).toEqual([false, false, false]);
    expect(noneUnlocked.map((s) => s.points)).toEqual([25, 50, 70]);

    const firstUnlocked = noHintMilestoneStates(25, 100);
    expect(firstUnlocked.map((s) => s.unlocked)).toEqual([true, false, false]);

    const twoUnlocked = noHintMilestoneStates(50, 100);
    expect(twoUnlocked.map((s) => s.unlocked)).toEqual([true, true, false]);

    const allUnlocked = noHintMilestoneStates(70, 100);
    expect(allUnlocked.map((s) => s.unlocked)).toEqual([true, true, true]);

    // Ceiling rounding test: maxScore 103 -> 25% is 25.75 -> 26 pts, 50% is 51.5 -> 52 pts, 70% is 72.1 -> 73 pts
    const roundedStates = noHintMilestoneStates(25, 103);
    expect(roundedStates[0]?.points).toBe(26);
    expect(roundedStates[0]?.unlocked).toBe(false);

    const roundedUnlocked = noHintMilestoneStates(26, 103);
    expect(roundedUnlocked[0]?.unlocked).toBe(true);
  });
});
