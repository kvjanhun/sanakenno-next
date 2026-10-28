import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PuzzleResponse } from '@sanakenno/shared';
import { apiClient } from '../../api/client.js';
import { useGameStore } from './useGameStore.js';

/**
 * Fetch the active daily puzzle (or an archived puzzle by Helsinki YYYY-MM-DD date)
 * via the typed Hono RPC client and sync into `useGameStore`.
 */
export function usePuzzleQuery(date: string | null = null) {
  const query = useQuery<PuzzleResponse>({
    queryKey: ['puzzle', date ?? 'today'],
    queryFn: async () => {
      const res = await apiClient.api.puzzle.$get(date ? { query: { date } } : undefined);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as PuzzleResponse;
    },
  });

  useEffect(() => {
    if (query.data) {
      void useGameStore.getState().loadPuzzle(query.data);
    }
  }, [query.data]);

  return query;
}
