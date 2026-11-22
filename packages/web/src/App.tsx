import { lazy, Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameplayView } from './features/gameplay/GameplayView.js';
import { ThemeToggle } from './features/theme/ThemeToggle.js';

const AdminLayout = lazy(() => import('@sanakenno/admin'));

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
      {isAdmin ? (
        <div className="min-h-dvh flex flex-col">
          <Suspense fallback={<div className="p-8 text-center text-sm">Ladataan ylläpitoa...</div>}>
            <AdminLayout themeToggle={<ThemeToggle />} />
          </Suspense>
        </div>
      ) : (
        <GameplayView />
      )}
    </QueryClientProvider>
  );
}
