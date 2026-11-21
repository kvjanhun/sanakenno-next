import { useEffect, useRef } from 'react';
import { getHelsinkiDateString } from '@sanakenno/shared';
import { useUiStore } from './useUiStore.js';

export { getHelsinkiDateString };

function getHelsinkiWallClockParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Return milliseconds from `now` until the next midnight in `Europe/Helsinki` timezone,
 * using `Intl.DateTimeFormat.formatToParts` so non-Helsinki browser timezones and DST
 * transitions never skew the delay.
 */
export function msUntilMidnight(now: Date = new Date()): number {
  const p = getHelsinkiWallClockParts(now);
  const nextDayUtcMidnight = Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0, 0);
  const probe = getHelsinkiWallClockParts(new Date(nextDayUtcMidnight));
  const probeAsUtc = Date.UTC(
    probe.year,
    probe.month - 1,
    probe.day,
    probe.hour,
    probe.minute,
    probe.second,
    0,
  );
  const helsinkiOffsetMs = probeAsUtc - nextDayUtcMidnight;
  const targetMidnightUtc = nextDayUtcMidnight - helsinkiOffsetMs;
  return Math.max(1, targetMidnightUtc - now.getTime());
}

export interface MidnightRolloverOptions {
  onRollover?: () => void;
  intervalMs?: number;
  getNow?: () => Date;
}

/**
 * Detect `Europe/Helsinki` date rollover on midnight timer, periodic interval,
 * and `visibilitychange`, refreshing the active daily puzzle when viewing today's puzzle.
 */
export function useMidnightRollover(
  optionsOrCallback?: MidnightRolloverOptions | (() => void),
): void {
  const options: MidnightRolloverOptions =
    typeof optionsOrCallback === 'function'
      ? { onRollover: optionsOrCallback }
      : (optionsOrCallback ?? {});

  const onRolloverRef = useRef(options.onRollover);
  onRolloverRef.current = options.onRollover;

  const getNowRef = useRef(options.getNow ?? (() => new Date()));
  getNowRef.current = options.getNow ?? (() => new Date());

  const intervalMs = options.intervalMs ?? 10_000;

  useEffect(() => {
    let lastDate = getHelsinkiDateString(getNowRef.current());

    const checkRollover = (): void => {
      const currentDate = getHelsinkiDateString(getNowRef.current());
      if (currentDate === lastDate) return;
      lastDate = currentDate;

      if (useUiStore.getState().viewingPuzzleDate !== null) {
        return;
      }

      if (onRolloverRef.current) {
        onRolloverRef.current();
      } else if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
    };

    let midnightTimerId: number | null = null;
    const scheduleMidnightTimer = (): void => {
      const delay = msUntilMidnight(getNowRef.current());
      midnightTimerId = window.setTimeout(() => {
        checkRollover();
        scheduleMidnightTimer();
      }, delay);
    };

    scheduleMidnightTimer();
    const intervalId = window.setInterval(checkRollover, intervalMs);

    const handleVisibility = (): void => {
      if (!document.hidden) {
        checkRollover();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (midnightTimerId !== null) {
        window.clearTimeout(midnightTimerId);
      }
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intervalMs]);
}
