import { describe, expect, it } from 'vitest';
import { msUntilMidnight } from '../../packages/web/src/features/gameplay/useMidnightRollover.js';

describe('msUntilMidnight (Europe/Helsinki DST-safe midnight calculation)', () => {
  it('computes milliseconds until midnight during standard time (EET, UTC+2)', () => {
    // 2026-01-15T21:59:30.000Z is 2026-01-15 23:59:30 in Europe/Helsinki (UTC+2)
    const now = new Date('2026-01-15T21:59:30.000Z');
    expect(msUntilMidnight(now)).toBe(30_000);
  });

  it('computes milliseconds until midnight during daylight saving time (EEST, UTC+3)', () => {
    // 2026-07-15T20:59:00.000Z is 2026-07-15 23:59:00 in Europe/Helsinki (UTC+3)
    const now = new Date('2026-07-15T20:59:00.000Z');
    expect(msUntilMidnight(now)).toBe(60_000);
  });

  it('accounts for 23-hour spring-forward DST transition day in Europe/Helsinki', () => {
    // On 2026-03-29, clocks jump forward at 01:00 UTC (03:00 EET -> 04:00 EEST).
    // Next Helsinki midnight (2026-03-30 00:00 EEST) is 2026-03-29T21:00:00.000Z.
    // From 2026-03-29T00:30:00.000Z (02:30 EET), real elapsed time until 21:00 UTC is 20.5 hours.
    const beforeSpringForward = new Date('2026-03-29T00:30:00.000Z');
    expect(msUntilMidnight(beforeSpringForward)).toBe(20.5 * 3600_000);
  });

  it('accounts for 25-hour fall-back DST transition day in Europe/Helsinki', () => {
    // On 2026-10-25, clocks fall back at 01:00 UTC (04:00 EEST -> 03:00 EET).
    // Next Helsinki midnight (2026-10-26 00:00 EET) is 2026-10-25T22:00:00.000Z.
    // From 2026-10-25T00:30:00.000Z (03:30 EEST), real elapsed time until 22:00 UTC is 21.5 hours.
    const beforeFallBack = new Date('2026-10-25T00:30:00.000Z');
    expect(msUntilMidnight(beforeFallBack)).toBe(21.5 * 3600_000);
  });
});
