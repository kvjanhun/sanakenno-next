import { useQuery } from '@tanstack/react-query';
import type { ArchiveResponse } from '@sanakenno/shared';
import { apiClient } from '../../api/client.js';

/**
 * Fetch the full puzzle archive (`GET /api/archive?all=true`) via the typed Hono RPC client.
 */
export function useArchiveQuery(enabled = true) {
  return useQuery<ArchiveResponse>({
    queryKey: ['archive', 'all'],
    enabled,
    queryFn: async () => {
      const res = await apiClient.api.archive.$get({ query: { all: 'true' } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as ArchiveResponse;
    },
  });
}
