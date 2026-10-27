import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CanaryStatusCard } from './features/system-status/CanaryStatusCard.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen p-6">
        <CanaryStatusCard />
      </main>
    </QueryClientProvider>
  );
}
