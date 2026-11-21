import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHelsinkiDateString, type PuzzleResponse } from '@sanakenno/shared';
import { apiClient } from '../../api/client.js';
import { loadCachedPuzzleResponse, saveCachedPuzzleResponse } from './storage.js';
import { useGameStore } from './useGameStore.js';

/**
 * Fetch the active daily puzzle (or an archived puzzle by Helsinki YYYY-MM-DD date)
 * via the typed Hono RPC client, caching responses locally for offline PWA reopen.
 */
export function usePuzzleQuery(date: string | null = null) {
  const query = useQuery<PuzzleResponse>({
    queryKey: ['puzzle', date ?? 'today'],
    networkMode: 'always',
    retry: false,
    queryFn: async () => {
      const targetDate = date ?? getHelsinkiDateString();
      try {
        const res = await apiClient.api.puzzle.$get(date ? { query: { date } } : undefined);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as PuzzleResponse;
        saveCachedPuzzleResponse(targetDate, data);
        if (data.date && data.date !== targetDate) {
          saveCachedPuzzleResponse(data.date, data);
        }
        return data;
      } catch (err) {
        const cached = loadCachedPuzzleResponse(targetDate);
        if (cached) {
          return cached;
        }
        throw err;
      }
    },
  });

  useEffect(() => {
    if (query.data) {
      void useGameStore.getState().loadPuzzle(query.data);
    }
  }, [query.data]);

  return query;
}
