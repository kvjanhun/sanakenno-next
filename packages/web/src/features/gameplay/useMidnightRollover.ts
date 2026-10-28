import { useEffect, useRef } from 'react';
import { getHelsinkiDateString } from '@sanakenno/shared';
import { useUiStore } from './useUiStore.js';

export { getHelsinkiDateString };

/** Return milliseconds from `now` until the next midnight in `Europe/Helsinki` timezone. */
export function msUntilMidnight(now: Date = new Date()): number {
  const helsinki = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
  const midnight = new Date(helsinki);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - helsinki.getTime());
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
