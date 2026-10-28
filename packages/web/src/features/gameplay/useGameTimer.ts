import { useEffect, useRef } from 'react';

export interface GameTimerApi {
  start: () => void;
  getElapsedMs: () => number;
  reset: () => void;
  restore: (startedAt: number | null, totalPausedMs: number) => void;
  getStartedAt: () => number | null;
  getTotalPausedMs: () => number;
}

/**
 * Game timer hook that tracks elapsed play time, pausing when the page
 * is hidden or blurred to exclude inactive time.
 */
export function useGameTimer(
  onSync?: (startedAt: number, totalPausedMs: number) => void,
): GameTimerApi {
  const startedAt = useRef<number | null>(null);
  const totalPausedMs = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const start = (): void => {
    if (startedAt.current === null) {
      startedAt.current = Date.now();
    }
  };

  const getElapsedMs = (): number => {
    if (startedAt.current === null) return 0;
    const end = hiddenAt.current !== null ? hiddenAt.current : Date.now();
    return end - startedAt.current - totalPausedMs.current;
  };

  const reset = (): void => {
    startedAt.current = null;
    totalPausedMs.current = 0;
    hiddenAt.current = null;
  };

  const restore = (saved: number | null, paused: number): void => {
    startedAt.current = saved;
    totalPausedMs.current = paused;
  };

  const getStartedAt = (): number | null => startedAt.current;
  const getTotalPausedMs = (): number => totalPausedMs.current;

  useEffect(() => {
    const pause = (): void => {
      if (startedAt.current !== null && hiddenAt.current === null) {
        hiddenAt.current = Date.now();
      }
    };

    const resume = (): void => {
      if (hiddenAt.current !== null) {
        totalPausedMs.current += Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (startedAt.current !== null) {
          onSyncRef.current?.(startedAt.current, totalPausedMs.current);
        }
      }
    };

    const handleVisibility = (): void => {
      if (document.hidden) {
        pause();
      } else {
        resume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', pause);
    window.addEventListener('focus', resume);
    window.addEventListener('pagehide', pause);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', pause);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pagehide', pause);
    };
  }, []);

  const api = useRef<GameTimerApi | null>(null);
  if (!api.current) {
    api.current = {
      start,
      getElapsedMs,
      reset,
      restore,
      getStartedAt,
      getTotalPausedMs,
    };
  }
  return api.current;
}
