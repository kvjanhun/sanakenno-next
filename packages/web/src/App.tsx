import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameplayView } from './features/gameplay/GameplayView.js';

const AdminLayout = lazy(() => import('./features/admin/AdminLayout.js'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function getIsAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hash.startsWith('#/admin');
}

export function App() {
  const [isAdmin, setIsAdmin] = useState(getIsAdminRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setIsAdmin(getIsAdminRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen pb-8">
        {isAdmin ? (
          <Suspense fallback={<div className="p-8 text-center text-sm">Ladataan ylläpitoa...</div>}>
            <AdminLayout />
          </Suspense>
        ) : (
          <GameplayView />
        )}
      </main>
    </QueryClientProvider>
  );
}
