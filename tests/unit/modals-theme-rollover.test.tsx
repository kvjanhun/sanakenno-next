import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_ID,
  STATS_STORAGE_KEY,
  type ArchiveResponse,
  type PlayerStats,
  type PuzzleWordsResponse,
} from '../../packages/shared/src/index.js';
import {
  getRawStorage,
  puzzleStateKey,
  revealedKey,
  saveToStorage,
} from '../../packages/web/src/features/gameplay/storage.js';
import {
  msUntilMidnight,
  useMidnightRollover,
} from '../../packages/web/src/features/gameplay/useMidnightRollover.js';
import { useUiStore } from '../../packages/web/src/features/gameplay/useUiStore.js';
import { ArchiveModal } from '../../packages/web/src/features/modals/ArchiveModal.js';
import { PuzzleWordsModal } from '../../packages/web/src/features/modals/PuzzleWordsModal.js';
import { RulesModal } from '../../packages/web/src/features/modals/RulesModal.js';
import { SettingsModal } from '../../packages/web/src/features/modals/SettingsModal.js';
import { StatsModal } from '../../packages/web/src/features/modals/StatsModal.js';
import { ThemeSelector } from '../../packages/web/src/features/theme/ThemeSelector.js';
import { ThemeToggle } from '../../packages/web/src/features/theme/ThemeToggle.js';
import {
  PALETTE_STORAGE_KEY,
  THEME_ID_STORAGE_KEY,
  usePaletteStore,
} from '../../packages/web/src/features/theme/usePaletteStore.js';
import {
  THEME_PREFERENCE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  useThemePreferenceStore,
} from '../../packages/web/src/features/theme/useThemePreferenceStore.js';

const mockArchiveEntries: ArchiveResponse = [
  {
    date: '2026-04-02',
    puzzle_number: 10,
    display_number: 2,
    letters: ['a', 'e', 'i', 'k', 'l', 'n', 's'],
    center: 'a',
    is_today: true,
    max_score: 100,
  },
  {
    date: '2026-04-01',
    puzzle_number: 5,
    display_number: 1,
    letters: ['n', 'e', 'h', 'i', 'k', 'o', 's'],
    center: 'n',
    is_today: false,
    max_score: 80,
  },
];

const mockPuzzleWordsResponse: PuzzleWordsResponse = {
  puzzle_number: 5,
  display_number: 1,
  center: 'n',
  letters: ['e', 'h', 'i', 'k', 'n', 'o', 's'],
  words: ['koko', 'nenä', 'keskihieno', 'aamu-uninen'],
  max_score: 80,
};

vi.mock('../../packages/web/src/api/client.js', () => ({
  apiClient: {
    api: {
      archive: {
        $get: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => mockArchiveEntries,
        })),
      },
      puzzle: {
        ':number': {
          words: {
            $get: vi.fn(async () => ({
              ok: true,
              status: 200,
              json: async () => mockPuzzleWordsResponse,
            })),
          },
        },
      },
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function RolloverHarness({ onRollover }: { onRollover: () => void }) {
  useMidnightRollover({ onRollover, intervalMs: 5_000 });
  return <div data-testid="rollover-harness" />;
}

describe('Spec 04: Theme & Palette Stores, Midnight Rollover, and Player Modals', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.getState().resetUi();
    usePaletteStore.getState().setLocal(DEFAULT_THEME_ID);
    useThemePreferenceStore.getState().setLocal('system');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates data-palette and data-theme DOM attributes and persists to localStorage keys', () => {
    expect(document.documentElement.getAttribute('data-palette')).toBe('hehku');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();

    act(() => {
      usePaletteStore.getState().setThemeId('meri');
    });
    expect(document.documentElement.getAttribute('data-palette')).toBe('meri');
    expect(JSON.parse(getRawStorage(THEME_ID_STORAGE_KEY) ?? '""')).toBe('meri');
    expect(JSON.parse(getRawStorage(PALETTE_STORAGE_KEY) ?? '""')).toBe('meri');

    act(() => {
      useThemePreferenceStore.getState().setPreference('dark');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(JSON.parse(getRawStorage(THEME_PREFERENCE_STORAGE_KEY) ?? '""')).toBe('dark');
    expect(JSON.parse(getRawStorage(THEME_STORAGE_KEY) ?? '""')).toBe('dark');

    act(() => {
      useThemePreferenceStore.getState().setPreference('light');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    act(() => {
      useThemePreferenceStore.getState().setPreference('system');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('switches palettes and themes via ThemeSelector, ThemeToggle, and SettingsModal', () => {
    render(
      <div>
        <ThemeSelector />
        <ThemeToggle />
        <SettingsModal show={true} onClose={() => {}} />
      </div>,
    );

    // Open ThemeSelector menu and select Metsä
    fireEvent.click(screen.getByRole('button', { name: 'Valitse väriteema' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Metsä' }));
    expect(usePaletteStore.getState().themeId).toBe('metsa');
    expect(document.documentElement.getAttribute('data-palette')).toBe('metsa');

    // Toggle theme via ThemeToggle
    fireEvent.click(screen.getByRole('button', { name: 'Vaihda tummaan teemaan' }));
    expect(useThemePreferenceStore.getState().preference).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Switch palette and theme via SettingsModal radio controls
    fireEvent.click(screen.getByRole('radio', { name: 'Yö' }));
    expect(usePaletteStore.getState().themeId).toBe('yo');
    expect(document.documentElement.getAttribute('data-palette')).toBe('yo');

    fireEvent.click(screen.getByRole('radio', { name: 'Vaalea' }));
    expect(useThemePreferenceStore.getState().preference).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('renders SettingsModal with single sync management button and dual cloud/device indicator', () => {
    const onOpenSync = vi.fn();
    const { rerender } = render(
      <SettingsModal
        show={true}
        onClose={() => {}}
        onOpenSync={onOpenSync}
        isLinked={false}
        sessionCount={1}
      />,
    );

    expect(screen.getByText('Pilvitallennus aktiivinen')).toBeInTheDocument();
    expect(screen.getByText('Käytössä vain tällä laitteella')).toBeInTheDocument();
    expect(screen.queryByText('Synkronoi tämä laite')).not.toBeInTheDocument();
    expect(screen.queryByText('Yhdistä olemassa olevaan tiliin')).not.toBeInTheDocument();

    const manageBtn = screen.getByRole('button', { name: 'Hallitse synkronointia' });
    expect(manageBtn).toBeInTheDocument();
    fireEvent.click(manageBtn);
    expect(onOpenSync).toHaveBeenCalledTimes(1);

    // When linked across multiple devices (sessionCount = 2)
    rerender(
      <SettingsModal
        show={true}
        onClose={() => {}}
        onOpenSync={onOpenSync}
        isLinked={true}
        sessionCount={2}
      />,
    );
    expect(screen.getByText('Synkronoitu (2 laitetta)')).toBeInTheDocument();
  });

  it('detects Europe/Helsinki midnight rollover on timer/interval and visibilitychange', () => {
    vi.useFakeTimers();
    // 2026-04-01 23:59:50 in Europe/Helsinki (EEST = UTC+3 -> 20:59:50Z)
    vi.setSystemTime(new Date('2026-04-01T20:59:50.000Z'));

    expect(msUntilMidnight(new Date())).toBe(10_000);

    const onRollover = vi.fn();
    render(<RolloverHarness onRollover={onRollover} />);
    expect(onRollover).not.toHaveBeenCalled();

    // Advance 12 seconds across Helsinki midnight (00:00:02 on 2026-04-02)
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(onRollover).toHaveBeenCalledTimes(1);

    // Simulate next day crossing while tab is hidden and then becoming visible
    vi.setSystemTime(new Date('2026-04-02T21:05:00.000Z')); // 2026-04-03 00:05:00 in Helsinki
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onRollover).toHaveBeenCalledTimes(2);
  });

  it('renders ArchiveModal with display_number (never raw slot), completion status, and past-puzzle selection', async () => {
    // Save progress for past puzzle slot 5 (display_number 1): score 40 / 80 = 50% -> Sanavalmis
    saveToStorage(puzzleStateKey(5), {
      foundWords: ['nenä', 'keskihieno'],
      score: 40,
      hintsUnlocked: [],
      startedAt: 1000,
      totalPausedMs: 0,
      scoreBeforeHints: null,
    });

    const onSelectPuzzle = vi.fn();
    const onRevealAnswers = vi.fn();

    render(
      <ArchiveModal
        show={true}
        onClose={() => {}}
        onSelectPuzzle={onSelectPuzzle}
        onRevealAnswers={onRevealAnswers}
        currentPuzzleNumber={10}
      />,
      { wrapper: createWrapper() },
    );

    // Wait for archive entries to render using display_number (#2 and #1, NOT raw slots #10 and #5)
    await waitFor(() => {
      expect(screen.getByTestId('archive-entry-2')).toBeInTheDocument();
      expect(screen.getByTestId('archive-entry-1')).toBeInTheDocument();
      expect(screen.getByText('Kenno #2')).toBeInTheDocument();
    });
    // Calendar grid always reserves 6 weeks (42 cells) so month changes never shift modal size
    const calendarGrid = screen.getByRole('grid', { name: 'Arkiston kalenteripäivät' });
    expect(calendarGrid.children).toHaveLength(42);
    expect(screen.queryByText('Kenno #10')).not.toBeInTheDocument();
    expect(screen.queryByText('Kenno #5')).not.toBeInTheDocument();

    // Click past puzzle (Kenno #1, slot 5) -> updates day panel with status
    fireEvent.click(screen.getByTestId('archive-entry-1'));
    expect(screen.getByText('Kenno #1')).toBeInTheDocument();
    expect(screen.getByText('Sanavalmis')).toBeInTheDocument();
    expect(screen.getByText(/2 sanaa/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pelaa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Näytä vastaukset' })).toBeInTheDocument();

    // Select Pelaa -> invokes onSelectPuzzle(5, '2026-04-01')
    fireEvent.click(screen.getByRole('button', { name: 'Pelaa' }));
    expect(onSelectPuzzle).toHaveBeenCalledWith(5, '2026-04-01');
  });

  it('supports day stepping, inline answer reveal confirmation, and month quick-jump in ArchiveModal', async () => {
    const onSelectPuzzle = vi.fn();
    const onRevealAnswers = vi.fn();

    render(
      <ArchiveModal
        show={true}
        onClose={() => {}}
        onSelectPuzzle={onSelectPuzzle}
        onRevealAnswers={onRevealAnswers}
        currentPuzzleNumber={10}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText('Kenno #2')).toBeInTheDocument();
    });

    // Step to previous day via day stepper
    const prevDayBtn = screen.getByRole('button', { name: 'Edellinen kenno' });
    expect(prevDayBtn).toBeEnabled();
    fireEvent.click(prevDayBtn);

    // Now Kenno #1 is selected; Tänään quick-jump pill appears in the modal header bar
    expect(screen.getByText('Kenno #1')).toBeInTheDocument();
    const todayBtn = screen.getByRole('button', { name: 'Tänään' });
    expect(todayBtn.closest('[data-modal-header]')).not.toBeNull();
    fireEvent.click(todayBtn);
    expect(screen.getByText('Kenno #2')).toBeInTheDocument();
    fireEvent.click(prevDayBtn);

    // Trigger reveal answers on unrevealed past puzzle -> shows inline confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Näytä vastaukset' }));
    expect(
      screen.getByText('Vastauksien paljastamisen jälkeen tästä kennosta ei enää kerry tilastoja.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Takaisin' })).toBeInTheDocument();

    // Confirm reveal
    fireEvent.click(screen.getByRole('button', { name: 'Paljasta vastaukset' }));
    expect(onRevealAnswers).toHaveBeenCalledWith(5, 1);
  });

  it('sets revealed_<slot> = true in PuzzleWordsModal and renders found/missed words with Kotus links', async () => {
    saveToStorage(puzzleStateKey(5), {
      foundWords: ['keskihieno', 'aamuuninen'],
      score: 17,
      hintsUnlocked: [],
      startedAt: 1000,
      totalPausedMs: 0,
      scoreBeforeHints: null,
    });

    expect(getRawStorage(revealedKey(5))).toBeNull();
    const onBack = vi.fn();

    render(
      <PuzzleWordsModal
        show={true}
        onClose={() => {}}
        onBack={onBack}
        puzzleNumber={5}
        displayNumber={1}
      />,
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      const counter = screen.getByText('2/4 löydetty');
      expect(counter).toBeInTheDocument();
      expect(counter.closest('[data-modal-header]')).not.toBeNull();
    });

    const backBtn = screen.getByRole('button', { name: 'Takaisin arkistoon' });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(getRawStorage(revealedKey(5))).toBe('true');

    const foundLink = screen.getByRole('link', {
      name: 'Avaa sanan "keskihieno" määritelmä Kotuksessa',
    });
    expect(foundLink).toHaveAttribute(
      'href',
      'https://www.kielitoimistonsanakirja.fi/#/keskihieno',
    );
    expect(foundLink.closest('li')).toHaveAttribute('data-word-found', 'true');

    const hyphenatedFoundLink = screen.getByRole('link', {
      name: 'Avaa sanan "aamu-uninen" määritelmä Kotuksessa',
    });
    expect(hyphenatedFoundLink).toHaveAttribute(
      'href',
      'https://www.kielitoimistonsanakirja.fi/#/aamu-uninen',
    );
    expect(hyphenatedFoundLink.closest('li')).toHaveAttribute('data-word-found', 'true');

    const missedLink = screen.getByRole('link', {
      name: 'Avaa sanan "nenä" määritelmä Kotuksessa',
    });
    expect(missedLink.closest('li')).toHaveAttribute('data-word-found', 'false');
  });

  it('renders StatsModal with computed streaks, rank distribution, no-hint stats, and RulesModal', () => {
    const sampleStats: PlayerStats = {
      version: 1,
      records: [
        {
          puzzle_number: 1,
          date: '2026-04-01',
          best_rank: 'Onnistuja',
          best_score: 15,
          max_score: 50,
          words_found: 5,
          hints_used: 0,
          elapsed_ms: 45_000,
          longest_word: 'kana',
          pangrams_found: 0,
          best_no_hint_score: 15,
        },
        {
          puzzle_number: 2,
          date: '2026-04-02',
          best_rank: 'Ällistyttävä',
          best_score: 40,
          max_score: 50,
          words_found: 9,
          hints_used: 0,
          elapsed_ms: 60_000,
          longest_word: 'kansallinen',
          pangrams_found: 1,
          best_no_hint_score: 40,
        },
      ],
    };
    saveToStorage(STATS_STORAGE_KEY, sampleStats);

    const onShare = vi.fn();
    render(
      <div>
        <StatsModal show={true} onClose={() => {}} onShare={onShare} />
        <RulesModal show={true} onClose={() => {}} />
      </div>,
    );

    expect(screen.getByText('Pelattuja pelejä')).toBeInTheDocument();
    expect(
      screen
        .getByRole('tablist', { name: 'Tilastojen välilehdet' })
        .closest('[data-modal-subheader]'),
    ).not.toBeNull();
    expect(screen.getByText('Pisin putki')).toBeInTheDocument();
    expect(screen.getByText('kansallinen')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument(); // 5 + 9 words found
    expect(screen.getByText('80 %')).toBeInTheDocument(); // 40/50 highest no-hint percentage
    expect(screen.getByText('Saavutetut tasot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jaa tulos' }));
    expect(onShare).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Pelin säännöt')).toBeInTheDocument();
    expect(screen.getByText('palo-ovi')).toBeInTheDocument();
    expect(screen.getByText('Matriisi:')).toBeInTheDocument();
    expect(screen.getByText('Vihjeet:')).toBeInTheDocument();
    expect(screen.getByText(/alkupareille/)).toBeInTheDocument();
    expect(screen.queryByText(/Yleiskuva/)).not.toBeInTheDocument();
  });

  it('renders SettingsModal open licenses accordion and lists Kotus, Zod, and core libraries', async () => {
    render(<SettingsModal show={true} onClose={() => {}} />);

    // Initial focus moves to dialog container rather than the Sulje button, and headerMeta shows Seuraava kenno
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });
    expect(screen.getByText(/Seuraava kenno:/).closest('[data-modal-header]')).not.toBeNull();

    const licensesTrigger = screen.getByRole('button', { name: 'Lisenssit' });
    expect(licensesTrigger).toBeInTheDocument();

    // Closed initially
    expect(screen.queryByText(/Sanakenno käyttää seuraavia/)).not.toBeInTheDocument();

    // Expand
    fireEvent.click(licensesTrigger);
    expect(
      screen.getByText('Sanakenno käyttää seuraavia avoimen lähdekoodin kirjastoja ja aineistoja:'),
    ).toBeInTheDocument();
    expect(screen.getByText('Kotus (Nykysuomen sanalista)')).toBeInTheDocument();
    expect(screen.getByText('CC BY 4.0')).toBeInTheDocument();
    expect(screen.getByText('Zod')).toBeInTheDocument();
    expect(screen.getByText('Argon2')).toBeInTheDocument();
    expect(screen.getByText('Lucide Icons')).toBeInTheDocument();
    expect(screen.getByText('Litestream')).toBeInTheDocument();
  });
});
