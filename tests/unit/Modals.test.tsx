import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveResponse } from '@sanakenno/shared';
import { ArchiveModal } from '../../packages/web/src/features/modals/ArchiveModal.js';
import { ModalShell } from '../../packages/web/src/features/modals/ModalShell.js';
import { PuzzleWordsModal } from '../../packages/web/src/features/modals/PuzzleWordsModal.js';
import { SettingsModal } from '../../packages/web/src/features/modals/SettingsModal.js';
import { isPuzzleRevealed } from '../../packages/web/src/features/gameplay/storage.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';
import { useThemePreferenceStore } from '../../packages/web/src/features/theme/useThemePreferenceStore.js';

describe('SettingsModal, ModalShell native <dialog>, and live OS theme reactivity', () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  function setOnlineStatus(online: boolean) {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => online,
    });
  }

  beforeEach(() => {
    localStorage.clear();
    setOnlineStatus(true);
    useAuthStore.setState({ isLoggedIn: true, sessionCount: 1 });
  });

  afterEach(() => {
    if (originalOnLineDescriptor) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnLineDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('shows active cloud sync when online and logged in, and updates live when offline/unauthenticated', () => {
    const { rerender } = render(<SettingsModal show={true} onClose={() => {}} />);

    expect(screen.getByText('Pilvitallennus aktiivinen')).toBeInTheDocument();

    act(() => {
      setOnlineStatus(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('Tallennettu tälle laitteelle (ei yhteyttä)')).toBeInTheDocument();
    expect(screen.queryByText('Pilvitallennus aktiivinen')).not.toBeInTheDocument();

    act(() => {
      setOnlineStatus(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByText('Pilvitallennus aktiivinen')).toBeInTheDocument();

    act(() => {
      useAuthStore.setState({ isLoggedIn: false });
    });
    rerender(<SettingsModal show={true} onClose={() => {}} />);

    expect(screen.getByText('Tallennettu tälle laitteelle (ei yhteyttä)')).toBeInTheDocument();
  });

  it('PuzzleWordsModal only sets revealed_<slot> and triggers syncRevealedPuzzle when word data actually loads, never on fetch error', async () => {
    const syncRevealedSpy = vi
      .spyOn(useAuthStore.getState(), 'syncRevealedPuzzle')
      .mockResolvedValue();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            puzzle_number: 42,
            display_number: 42,
            center: 'a',
            letters: ['e', 'i', 'k', 'l', 'n', 's'],
            words: ['kana', 'sana'],
            word_count: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const failedClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={failedClient}>
        <PuzzleWordsModal show={true} puzzleNumber={42} onClose={() => {}} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Sanalistaa ei voitu ladata.')).toBeInTheDocument();
    });
    expect(isPuzzleRevealed(42)).toBe(false);
    expect(syncRevealedSpy).not.toHaveBeenCalled();
    unmount();

    const okClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={okClient}>
        <PuzzleWordsModal show={true} puzzleNumber={42} onClose={() => {}} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('kana')).toBeInTheDocument();
    });
    expect(isPuzzleRevealed(42)).toBe(true);
    expect(syncRevealedSpy).toHaveBeenCalledWith(42);
    syncRevealedSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('opens ModalShell as a native <dialog>, handles cancel (Escape) and backdrop click, ignores drag-out clicks, and preserves input focus across re-renders', () => {
    const onClose1 = vi.fn();
    const { rerender } = render(
      <ModalShell show={true} title="Testidialogi" titleId="test-dlg-title" onClose={onClose1}>
        <input aria-label="Sisäinen kenttä" />
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
    expect(document.activeElement).toBe(dialog);

    // Focus input inside modal, then re-render with a brand new onClose identity -> focus must NOT be stolen
    const input = screen.getByLabelText('Sisäinen kenttä');
    input.focus();
    expect(document.activeElement).toBe(input);

    const onClose2 = vi.fn();
    rerender(
      <ModalShell show={true} title="Testidialogi" titleId="test-dlg-title" onClose={onClose2}>
        <input aria-label="Sisäinen kenttä" />
      </ModalShell>,
    );
    expect(document.activeElement).toBe(input);

    // Drag selection starting inside the modal and releasing on the <dialog> backdrop must NOT close
    fireEvent.pointerDown(input);
    fireEvent.click(dialog);
    expect(onClose2).not.toHaveBeenCalled();

    // Direct backdrop click (pointerDown + click on <dialog>) closes the modal
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose2).toHaveBeenCalledTimes(1);

    // Escape / cancel event invokes onClose
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose2).toHaveBeenCalledTimes(2);
  });

  it('closes only the nested confirm <dialog> on Escape inside ArchiveModal without closing ArchiveModal itself', async () => {
    const entries: ArchiveResponse = [
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(entries), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const onCloseArchive = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ArchiveModal
          show={true}
          onClose={onCloseArchive}
          onSelectPuzzle={() => {}}
          onRevealAnswers={() => {}}
          currentPuzzleNumber={10}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('archive-entry-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('archive-entry-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Näytä vastaukset' }));

    const confirmDialog = screen.getByRole('alertdialog') as HTMLDialogElement;
    expect(confirmDialog.tagName).toBe('DIALOG');
    expect(confirmDialog).toHaveAttribute('open');
    expect(document.activeElement).toBe(confirmDialog);

    // Pressing Escape closes only the confirmation alertdialog, keeping ArchiveModal open
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onCloseArchive).not.toHaveBeenCalled();

    // Pressing Escape a second time now closes ArchiveModal
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseArchive).toHaveBeenCalledTimes(1);
  });

  it('toggles PrivacySection <details> natively and renders Lucide attribution in SettingsModal Lisenssit', () => {
    render(<SettingsModal show={true} onClose={() => {}} />);

    const summary = screen.getByText('Tietosuoja ja evästeet').closest('summary');
    expect(summary).not.toBeNull();
    const details = summary!.closest('details')!;
    expect(details.open).toBe(false);

    fireEvent.click(summary!);
    expect(details.open).toBe(true);

    const licensesBtn = screen.getByRole('button', { name: 'Lisenssit' });
    expect(licensesBtn).toHaveAttribute('aria-expanded', 'false');
    expect(licensesBtn).toHaveAttribute('aria-controls', 'settings-licenses-panel');

    fireEvent.click(licensesBtn);
    expect(licensesBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Lucide (lucide-react)')).toBeInTheDocument();
    expect(screen.getByText('ISC')).toBeInTheDocument();
  });

  it('updates resolvedScheme reactively when matchMedia dispatches a change event in system mode', () => {
    let darkMatches = false;
    const changeListeners = new Set<(e: MediaQueryListEvent) => void>();
    const fakeMql = {
      get matches() {
        return darkMatches;
      },
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        changeListeners.add(cb);
      },
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        changeListeners.delete(cb);
      },
    } as unknown as MediaQueryList;

    vi.spyOn(window, 'matchMedia').mockImplementation(() => fakeMql);

    act(() => {
      useThemePreferenceStore.getState().setLocal('system');
    });
    expect(useThemePreferenceStore.getState().resolvedScheme).toBe('light');

    act(() => {
      darkMatches = true;
      for (const listener of changeListeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
    });
    expect(useThemePreferenceStore.getState().resolvedScheme).toBe('dark');
  });
});
