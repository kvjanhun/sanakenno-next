import { useEffect, useState } from 'react';
import { ThemeToggle } from '../theme/ThemeToggle.js';
import { usePaletteStore } from '../theme/usePaletteStore.js';
import { adminButtonClass, adminButtonStyle } from './AdminPrimitives.js';
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

const ADMIN_TABS: readonly { id: Tab; label: string }[] = [
  { id: 'editor', label: 'Puzzlet' },
  { id: 'schedule', label: 'Aikataulu' },
  { id: 'blocked', label: 'Estetyt sanat' },
  { id: 'combinations', label: 'Yhdistelmät' },
  { id: 'rejected', label: 'Hylätyt' },
  { id: 'analytics', label: 'Tilastot' },
  { id: 'worddata', label: 'Sanadata' },
];

export function AdminLayout(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('editor');
  const [prefillLetters, setPrefillLetters] = useState<string | null>(null);
  usePaletteStore((s) => s.themeId);
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
        className="min-h-screen flex items-center justify-center p-4 text-sm font-medium select-text"
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
      className="min-h-screen select-text"
      style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
    >
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="text-lg font-semibold tracking-tight whitespace-nowrap"
                style={{ fontFamily: 'var(--font-game)', color: 'var(--color-text-primary)' }}
              >
                Sanakenno
                <span style={{ color: 'var(--color-accent)', fontWeight: 800 }}>.</span>
                <span style={{ fontWeight: 300 }}>fi</span>
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                  color: 'var(--color-accent)',
                }}
              >
                Admin
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {username && (
                <span
                  className="hidden sm:inline text-xs font-medium mr-1"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {username}
                </span>
              )}
              <ThemeToggle />
              <a
                href="#/"
                className={`${adminButtonClass('sm')} no-underline`}
                style={adminButtonStyle('secondary', 'secondary')}
              >
                Peliin
              </a>
              <button
                type="button"
                onClick={() => void logout()}
                className={adminButtonClass('sm')}
                style={adminButtonStyle('danger')}
              >
                Kirjaudu ulos
              </button>
            </div>
          </div>

          <nav aria-label="Ylläpidon osiot" className="pb-3">
            <div
              role="tablist"
              className="flex flex-wrap sm:flex-nowrap items-center gap-1 p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              {ADMIN_TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer border-none transition-all"
                    style={{
                      backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                      color: active ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {tab === 'editor' && (
          <PuzzleEditor
            prefillLetters={prefillLetters}
            onPrefillConsumed={() => setPrefillLetters(null)}
          />
        )}
        {tab === 'schedule' && <Schedule />}
        {tab === 'blocked' && <BlockedWords />}
        {tab === 'combinations' && (
          <CombinationsBrowser
            csrfToken={csrfToken}
            onSelectLetters={(letters) => {
              setPrefillLetters(letters);
              setTab('editor');
            }}
          />
        )}
        {tab === 'rejected' && <SuggestionRejections csrfToken={csrfToken} />}
        {tab === 'analytics' && <Stats csrfToken={csrfToken} />}
        {tab === 'worddata' && <WordData csrfToken={csrfToken} />}
      </main>
    </div>
  );
}

export default AdminLayout;
