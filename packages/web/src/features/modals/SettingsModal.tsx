import { useEffect, useState, type ReactNode } from 'react';
import { THEME_IDS, type ThemeId, type ThemePreference } from '@sanakenno/shared';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  LinkIcon,
  MonitorIcon,
  MoonIcon,
  SmartphoneIcon,
  SunIcon,
  type IconProps,
} from '../gameplay/icons.js';
import { msUntilMidnight } from '../gameplay/useMidnightRollover.js';
import { PALETTE_LABELS, paletteAccent, usePaletteStore } from '../theme/usePaletteStore.js';
import { resolveScheme, useThemePreferenceStore } from '../theme/useThemePreferenceStore.js';
import { ModalShell } from './ModalShell.js';

export interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
  onOpenSync?: () => void;
  isLinked?: boolean;
  syncSlot?: ReactNode;
}

const THEME_CHOICES: readonly {
  id: ThemePreference;
  label: string;
  icon: (props: IconProps) => React.JSX.Element;
}[] = [
  { id: 'system', label: 'Laite', icon: MonitorIcon },
  { id: 'light', label: 'Vaalea', icon: SunIcon },
  { id: 'dark', label: 'Tumma', icon: MoonIcon },
];

const LICENSES = [
  { name: 'React', license: 'MIT', copyright: 'Meta Platforms, Inc.', url: 'https://react.dev' },
  { name: 'Vite', license: 'MIT', copyright: 'Evan You', url: 'https://vite.dev' },
  {
    name: 'Tailwind CSS',
    license: 'MIT',
    copyright: 'Tailwind Labs, Inc.',
    url: 'https://tailwindcss.com',
  },
  {
    name: 'TanStack Query',
    license: 'MIT',
    copyright: 'Tanner Linsley',
    url: 'https://tanstack.com/query',
  },
  {
    name: 'Zustand',
    license: 'MIT',
    copyright: 'Paul Henschel',
    url: 'https://github.com/pmndrs/zustand',
  },
  { name: 'Hono', license: 'MIT', copyright: 'Yusuke Wada', url: 'https://hono.dev' },
  {
    name: 'Kysely',
    license: 'MIT',
    copyright: 'Sami Koskimäki',
    url: 'https://kysely.dev',
  },
  {
    name: 'better-sqlite3',
    license: 'MIT',
    copyright: 'Joshua Wise',
    url: 'https://github.com/WiseLibs/better-sqlite3',
  },
];

function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Render a settings menu modal containing appearance, countdown, and sync options.
 */
export function SettingsModal({
  show,
  onClose,
  onOpenSync,
  isLinked = false,
  syncSlot,
}: SettingsModalProps): React.JSX.Element {
  const themeId = usePaletteStore((s) => s.themeId);
  const setThemeId = usePaletteStore((s) => s.setThemeId);
  const preference = useThemePreferenceStore((s) => s.preference);
  const setPreference = useThemePreferenceStore((s) => s.setPreference);
  const scheme = resolveScheme(preference);

  const [timeRemaining, setTimeRemaining] = useState<string>('00:00:00');
  const [msRemaining, setMsRemaining] = useState<number>(0);
  const [licensesOpen, setLicensesOpen] = useState(false);

  useEffect(() => {
    if (!show) return;

    const updateTimer = () => {
      const ms = msUntilMidnight();
      setMsRemaining(ms);
      setTimeRemaining(formatTimeRemaining(ms));
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [show]);

  return (
    <ModalShell
      show={show}
      title="Asetukset"
      titleId="settings-modal-title"
      onClose={onClose}
      headerClassName="mb-3"
      className="flex flex-col"
      style={{ maxHeight: '85vh', overflowY: 'hidden' }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        <div className="text-xs text-right" style={{ color: 'var(--color-text-tertiary)' }}>
          Seuraava kenno:{' '}
          <span
            className="font-bold font-mono"
            style={{
              color:
                msRemaining < 30 * 60 * 1000 ? 'var(--color-accent)' : 'var(--color-text-primary)',
            }}
          >
            {timeRemaining}
          </span>
        </div>

        <div className="space-y-1.5">
          <h3
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Ulkoasu
          </h3>

          <div
            className="space-y-2.5 p-2.5 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <div className="flex items-start justify-between gap-1.5">
              {THEME_IDS.map((id: ThemeId) => {
                const selected = id === themeId;
                const isMonoDark = id === 'mono' && scheme === 'dark';
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={PALETTE_LABELS[id]}
                    onClick={() => setThemeId(id)}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                  >
                    <span
                      className="flex items-center justify-center rounded-full transition-transform active:scale-95"
                      style={{
                        width: 30,
                        height: 30,
                        backgroundColor: paletteAccent(id, scheme),
                        border: selected
                          ? '2px solid var(--color-text-primary)'
                          : '1px solid var(--color-border)',
                        boxSizing: 'border-box',
                      }}
                    >
                      {selected && (
                        <CheckIcon
                          size={14}
                          strokeWidth={3}
                          style={{ color: isMonoDark ? 'black' : 'white' }}
                        />
                      )}
                    </span>
                    <span
                      className="truncate text-center w-full"
                      style={{
                        fontSize: 9.5,
                        color: 'var(--color-text-primary)',
                        fontWeight: selected ? 700 : 400,
                      }}
                    >
                      {PALETTE_LABELS[id]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2 border-t"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {THEME_CHOICES.map((choice) => {
                const selected = choice.id === preference;
                const Icon = choice.icon;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={choice.label}
                    onClick={() => setPreference(choice.id)}
                    className="flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-xs font-semibold cursor-pointer transition-transform active:scale-95"
                    style={{
                      backgroundColor: selected ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                      borderColor: selected ? 'var(--color-accent-faded)' : 'var(--color-border)',
                      color: selected ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                    }}
                  >
                    <Icon size={13} strokeWidth={2.5} />
                    <span className="truncate">{choice.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h3
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Synkronointi
          </h3>
          {syncSlot ?? (
            <div
              className="p-2.5 rounded-lg space-y-2"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              <div className="flex items-center gap-2">
                {isLinked ? (
                  <>
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Synkronointi aktiivinen
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircleIcon size={13} className="text-amber-500" />
                    <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      Ei synkronoitu
                    </span>
                  </>
                )}
              </div>

              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.72rem',
                  lineHeight: '1.35',
                }}
              >
                {isLinked
                  ? 'Pelitilanteesi ja tilastosi tallennetaan jatkuvasti pilveen. Voit synkronoida ne muille laitteillesi.'
                  : 'Tallenna edistymisesi, tilastosi ja asetuksesi, ja synkronoi ne muille laitteillesi.'}
              </p>

              {isLinked ? (
                <button
                  type="button"
                  onClick={onOpenSync}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border font-semibold text-xs cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <LinkIcon size={13} />
                  <span>Hallitse synkronointia</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={onOpenSync}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg font-semibold text-xs cursor-pointer border-none"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--color-on-accent)',
                    }}
                  >
                    <LinkIcon size={13} />
                    <span>Synkronoi tämä laite</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSync}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border font-semibold text-xs cursor-pointer"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <LinkIcon size={13} />
                    <span>Yhdistä olemassa olevaan tiliin</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <h3
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Pelaa sovelluksena
          </h3>
          <div
            className="p-2.5 rounded-lg"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <ul
              className="space-y-2 pl-0 m-0 list-none text-[0.72rem] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <li className="flex items-start gap-1.5">
                <SmartphoneIcon
                  size={13}
                  className="shrink-0 mt-0.5"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span>
                  Voit asentaa Sanakennon sovelluksena kotinäytöllesi selaimesi valikon kautta
                  (&quot;Lisää kotinäytölle&quot; tai &quot;Asenna sovellus&quot;).
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <SmartphoneIcon
                  size={13}
                  className="shrink-0 mt-0.5"
                  style={{ color: 'var(--color-accent)' }}
                />
                <span>
                  Jo ladattua peliä voi pelata ilman internet-yhteyttä. Uuden pelin lataaminen tai
                  edistymisen synkronointi vaatii internetyhteyden.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="flex items-center justify-center gap-2 text-[11px] pt-3 border-t"
          style={{
            color: 'var(--color-text-tertiary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <a
            href="https://erez.ac"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'inherit' }}
          >
            erez.ac
          </a>
          <span aria-hidden="true" style={{ opacity: 0.5 }}>
            ·
          </span>
          <a
            href="https://github.com/kvjanhun/sanakenno"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'inherit' }}
          >
            GitHub
          </a>
          <span aria-hidden="true" style={{ opacity: 0.5 }}>
            ·
          </span>
          <button
            type="button"
            onClick={() => setLicensesOpen((v) => !v)}
            className="inline-flex items-center gap-0.5 bg-transparent border-none cursor-pointer p-0 text-[11px] hover:underline"
            style={{ color: 'inherit' }}
          >
            <span>Lisenssit</span>
            <ChevronDownIcon
              size={12}
              strokeWidth={2.5}
              style={{
                transform: licensesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>
        </div>

        {licensesOpen && (
          <div className="space-y-2 pt-1">
            <p
              className="text-[9.5px] text-center mb-1.5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Sanakenno käyttää seuraavia avoimen lähdekoodin kirjastoja:
            </p>
            <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
              {LICENSES.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-4 py-1.5 border-b last:border-b-0"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--color-border) 30%, transparent)',
                  }}
                >
                  <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[10.5px] truncate"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      {entry.name}
                    </a>
                    <span
                      className="text-[8.5px] truncate"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {entry.copyright}
                    </span>
                  </div>
                  <span
                    className="font-mono text-[7.5px] font-bold tracking-wide shrink-0 opacity-80"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {entry.license}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
