import { useQuery } from '@tanstack/react-query';
import type { PuzzleWordsResponse } from '@sanakenno/shared';
import { apiClient } from '../../api/client.js';

/**
 * Fetch the full word list for a past puzzle slot (`GET /api/puzzle/:number/words`)
 * via the typed Hono RPC client.
 */
export function usePuzzleWordsQuery(puzzleNumber: number | null, enabled = true) {
  return useQuery<PuzzleWordsResponse>({
    queryKey: ['puzzle-words', puzzleNumber],
    enabled: enabled && puzzleNumber !== null,
    queryFn: async () => {
      const res = await apiClient.api.puzzle[':number'].words.$get({
        param: { number: String(puzzleNumber) },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as PuzzleWordsResponse;
    },
  });
}
