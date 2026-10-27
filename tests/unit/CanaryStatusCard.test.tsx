import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanaryStatusCard } from '../../packages/web/src/features/system-status/CanaryStatusCard.js';

vi.mock('../../packages/web/src/features/system-status/useSystemHealth.js', () => ({
  useSystemHealth: () => ({
    isLoading: false,
    isError: false,
    data: {
      status: 'ok',
      engine: 'kysely-sqlite',
      total_puzzles: 2,
      timezone: 'Europe/Helsinki',
    },
  }),
}));

describe('CanaryStatusCard (.test.tsx jsdom verification)', () => {
  it('renders active puzzle count and database engine in Finnish UI', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CanaryStatusCard />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: /Sanakenno 2\.0/i })).toBeInTheDocument();
    expect(screen.getByTestId('canary-status')).toHaveTextContent('kysely-sqlite');
    expect(screen.getByTestId('puzzle-count')).toHaveTextContent('2');
  });
});
