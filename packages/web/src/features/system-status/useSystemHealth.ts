import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@sanakenno/shared';
import { apiClient } from '../../api/client.js';

/**
 * Query the typed Hono RPC /api/health endpoint.
 */
export function useSystemHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await apiClient.api.health.$get();
      if (!res.ok) {
        throw new Error(`Health check failed: ${res.status}`);
      }
      return res.json();
    },
  });
}
