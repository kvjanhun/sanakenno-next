import { useEffect, useState } from 'react';
import { BlockedWords } from './BlockedWords.js';
import { CombinationsBrowser } from './CombinationsBrowser.js';
import { LoginPage } from './LoginPage.js';
import { PuzzleEditor } from './PuzzleEditor.js';
import { Schedule } from './Schedule.js';
import { Stats } from './Stats.js';
import { SuggestionRejections } from './SuggestionRejections.js';
import { useAdminStore } from './useAdminStore.js';
import { WordData } from './WordData.js';

type Tab =
  'editor' | 'schedule' | 'blocked' | 'combinations' | 'rejected' | 'analytics' | 'worddata';

export function AdminLayout(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('editor');
  const isAuthenticated = useAdminStore((s) => s.isAuthenticated);
  const isLoading = useAdminStore((s) => s.isLoading);
  const username = useAdminStore((s) => s.username);
  const csrfToken = useAdminStore((s) => s.csrfToken);
  const logout = useAdminStore((s) => s.logout);
  const checkSession = useAdminStore((s) => s.checkSession);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 text-sm font-medium"
        style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)' }}
      >
        Tarkistetaan istuntoa...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
    >
      <header
        className="border-b"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-sm tracking-tight">Sanakenno Admin</span>
            <nav className="flex gap-2 text-xs font-medium">
              <button
                type="button"
                onClick={() => setTab('editor')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'editor' ? 'var(--color-accent)' : 'transparent',
                  color: tab === 'editor' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Puzzlet
              </button>
              <button
                type="button"
                onClick={() => setTab('schedule')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'schedule' ? 'var(--color-accent)' : 'transparent',
                  color:
                    tab === 'schedule' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Aikataulu
              </button>
              <button
                type="button"
                onClick={() => setTab('blocked')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'blocked' ? 'var(--color-accent)' : 'transparent',
                  color:
                    tab === 'blocked' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Estetyt sanat
              </button>
              <button
                type="button"
                onClick={() => setTab('combinations')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'combinations' ? 'var(--color-accent)' : 'transparent',
                  color:
                    tab === 'combinations'
                      ? 'var(--color-bg-primary)'
                      : 'var(--color-text-primary)',
                }}
              >
                Yhdistelmät
              </button>
              <button
                type="button"
                onClick={() => setTab('rejected')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'rejected' ? 'var(--color-accent)' : 'transparent',
                  color:
                    tab === 'rejected' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Hylätyt
              </button>
              <button
                type="button"
                onClick={() => setTab('analytics')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'analytics' ? 'var(--color-accent)' : 'transparent',
                  color:
                    tab === 'analytics' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Tilastot
              </button>
              <button
                type="button"
                onClick={() => setTab('worddata')}
                className="px-3 py-1.5 rounded cursor-pointer transition-colors"
                style={{
                  backgroundColor: tab === 'worddata' ? 'var(--color-accent)' : 'transparent',
                  color:
                    tab === 'worddata' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Sanadata
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: 'var(--color-text-secondary)' }}>{username}</span>
            <a
              href="#/"
              className="px-2.5 py-1 rounded border cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              Peliin
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-2.5 py-1 rounded cursor-pointer font-medium"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-error)',
                borderColor: 'var(--color-border)',
              }}
            >
              Kirjaudu ulos
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {tab === 'editor' && <PuzzleEditor />}
        {tab === 'schedule' && <Schedule />}
        {tab === 'blocked' && <BlockedWords />}
        {tab === 'combinations' && <CombinationsBrowser csrfToken={csrfToken} />}
        {tab === 'rejected' && <SuggestionRejections csrfToken={csrfToken} />}
        {tab === 'analytics' && <Stats csrfToken={csrfToken} />}
        {tab === 'worddata' && <WordData csrfToken={csrfToken} />}
      </main>
    </div>
  );
}

export default AdminLayout;
