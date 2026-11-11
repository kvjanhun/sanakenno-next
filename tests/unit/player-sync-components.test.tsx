import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectBanner } from '../../packages/web/src/features/player-sync/ConnectBanner.js';
import { SettingsModal } from '../../packages/web/src/features/modals/SettingsModal.js';
import { SyncModal } from '../../packages/web/src/features/player-sync/SyncModal.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';

describe('Player Sync UI Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isLoggedIn: true,
      playerId: 42,
      playerKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      isLinked: false,
      isLoading: false,
      error: null,
      requestTransferTicket: vi.fn().mockResolvedValue({
        ticket: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        code: '123-456',
        expires_at: new Date(Date.now() + 900_000).toISOString(),
      }),
    });
  });

  describe('ConnectBanner', () => {
    it('returns null when token is null', () => {
      const { container } = render(<ConnectBanner token={null} onClose={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders connect dialog and triggers useTransfer on confirm', async () => {
      const mockUseTransfer = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        useTransfer: mockUseTransfer,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      const onClose = vi.fn();

      render(<ConnectBanner token="sample-token-123" onClose={onClose} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Yhdistä laite tiliisi')).toBeInTheDocument();

      const connectBtn = screen.getByRole('button', { name: 'Yhdistä laite' });
      fireEvent.click(connectBtn);

      await waitFor(() => {
        expect(mockUseTransfer).toHaveBeenCalledWith('sample-token-123');
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('shows error when transfer fails', async () => {
      const mockUseTransfer = vi.fn().mockRejectedValue(new Error('Virheellinen koodi'));
      useAuthStore.setState({
        useTransfer: mockUseTransfer,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      const onClose = vi.fn();

      render(<ConnectBanner token="bad-token" onClose={onClose} />);

      const connectBtn = screen.getByRole('button', { name: 'Yhdistä laite' });
      fireEvent.click(connectBtn);

      await waitFor(() => {
        expect(screen.getByText('Virheellinen koodi')).toBeInTheDocument();
      });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('SyncModal', () => {
    it('does not render when show is false', () => {
      render(<SyncModal show={false} onClose={vi.fn()} />);
      expect(screen.queryByText('Tämän laitteen yhdistämiskoodi')).not.toBeInTheDocument();
    });

    it('renders modal options and displays player key code', async () => {
      render(<SyncModal show={true} onClose={vi.fn()} />);

      expect(screen.getByText('Tämän laitteen yhdistämiskoodi')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('123-456')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Kopioi koodi' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Kopioi linkki' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lähetä sähköpostitse' })).toBeInTheDocument();
    });

    it('submits pairing code when entered in code input', async () => {
      const mockUseTransfer = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        useTransfer: mockUseTransfer,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      const onClose = vi.fn();

      render(<SyncModal show={true} onClose={onClose} />);

      const input = screen.getByPlaceholderText('Esim. 123-456');
      fireEvent.change(input, { target: { value: 'target-code-999' } });

      const submitBtn = screen.getByRole('button', { name: 'Yhdistä' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUseTransfer).toHaveBeenCalledWith('target-code-999');
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('handles distinct copy feedback for pairing code vs link', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      render(<SyncModal show={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('123-456')).toBeInTheDocument();
      });

      const copyCodeBtn = screen.getByRole('button', { name: 'Kopioi koodi' });
      const copyLinkBtn = screen.getByRole('button', { name: 'Kopioi linkki' });

      // Click copy link -> link button displays "Linkki kopioitu!", code button stays untouched
      expect(copyLinkBtn.querySelector('.inline-grid')).toBeInTheDocument();
      expect(copyCodeBtn.querySelector('.inline-grid')).toBeInTheDocument();
      fireEvent.click(copyLinkBtn);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Linkki kopioitu!' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Kopioi koodi' })).toBeInTheDocument();
      });

      // Click copy code -> code button displays "Kopioitu!"
      fireEvent.click(copyCodeBtn);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Kopioitu!' })).toBeInTheDocument();
      });
    });

    it('shows "Lopeta synkronointi" only when linked and handles unlinking while preserving progress', async () => {
      const mockLogout = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        logout: mockLogout,
        isLinked: false,
        sessionCount: 1,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      const onClose = vi.fn();

      const { rerender } = render(<SyncModal show={true} onClose={onClose} />);
      expect(screen.queryByRole('button', { name: 'Lopeta synkronointi' })).not.toBeInTheDocument();

      // Now set linked
      useAuthStore.setState({
        isLinked: true,
        sessionCount: 2,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      rerender(<SyncModal show={true} onClose={onClose} />);

      const stopSyncBtn = screen.getByRole('button', { name: 'Lopeta synkronointi' });
      expect(stopSyncBtn).toBeInTheDocument();
      fireEvent.click(stopSyncBtn);

      expect(screen.getByText('Haluatko lopettaa synkronoinnin?')).toBeInTheDocument();
      const confirmBtn = screen.getByRole('button', { name: 'Lopeta synkronointi' });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledWith({ clearLocalProgress: false });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('handles resetting device game progress with explicit destructive confirmation', async () => {
      const mockLogout = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        logout: mockLogout,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      const onClose = vi.fn();

      render(<SyncModal show={true} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'Nollaa tämän laitteen pelitiedot' }));
      expect(
        screen.getByText('Haluatko varmasti nollata tämän laitteen pelitiedot?'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Nollaa pelitiedot' }));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledWith({ clearLocalProgress: true });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('refreshes session count when SettingsModal or SyncModal is opened with show: true', () => {
      const mockRefresh = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        refreshSessionCount: mockRefresh,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);

      const { unmount } = render(<SyncModal show={true} onClose={() => {}} />);
      expect(mockRefresh).toHaveBeenCalledTimes(1);

      unmount();
      mockRefresh.mockClear();

      render(<SettingsModal show={true} onClose={() => {}} />);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it('renders privacy disclosure section in SettingsModal and expands GDPR details on click', () => {
      render(<SettingsModal show={true} onClose={() => {}} />);

      expect(screen.getByText('Tietosuoja ja evästeet')).toBeInTheDocument();
      expect(screen.queryByText('Rekisterinpitäjä ja tarkoitus')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Tietosuoja ja evästeet'));

      expect(screen.getByText('Rekisterinpitäjä ja tarkoitus')).toBeInTheDocument();
      expect(
        screen.getByText(/Tietoja käsitellään ainoastaan pelitilanteen tallentamiseen/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Resend-palvelu/)).toBeInTheDocument();
      expect(screen.getByText(/30 päivää/)).toBeInTheDocument();
      const resendLink = screen.getByRole('link', { name: /Resendin tietosuojaseloste/i });
      expect(resendLink).toHaveAttribute('href', 'https://resend.com/legal/privacy-policy');
      expect(resendLink).toHaveAttribute('target', '_blank');
      expect(resendLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByText(/Selaimen paikallinen muisti/)).toBeInTheDocument();
      expect(screen.getAllByText(/localStorage/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Tietojen poisto ja omat oikeutesi/)).toBeInTheDocument();
    });
  });
});
