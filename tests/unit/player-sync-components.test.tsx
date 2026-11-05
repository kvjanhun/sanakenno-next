import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectBanner } from '../../packages/web/src/features/player-sync/ConnectBanner.js';
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

    it('renders modal options and displays player key code', () => {
      render(<SyncModal show={true} onClose={vi.fn()} />);

      expect(screen.getByText('Tämän laitteen yhdistämiskoodi')).toBeInTheDocument();
      expect(
        screen.getByText('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
      ).toBeInTheDocument();
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

      const input = screen.getByPlaceholderText('Liitä yhdistämiskoodi tähän');
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

    it('handles rotate confirmation with clear label', async () => {
      const mockRotate = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        rotatePlayerKey: mockRotate,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);

      render(<SyncModal show={true} onClose={vi.fn()} />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Katkaise muut laitteet ja vaihda koodi' }),
      );
      expect(screen.getByText('Haluatko varmasti vaihtaa koodin?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Vaihda koodi' }));
      await waitFor(() => {
        expect(mockRotate).toHaveBeenCalled();
      });
    });

    it('handles unlinking device with keep-progress or clear-progress choices', async () => {
      const mockLogout = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({
        logout: mockLogout,
      } as unknown as Partial<ReturnType<typeof useAuthStore.getState>>);
      const onClose = vi.fn();

      const { unmount } = render(<SyncModal show={true} onClose={onClose} />);

      // Open unlinking confirmation
      fireEvent.click(screen.getByRole('button', { name: 'Irrota tämä laite tilistä' }));
      expect(
        screen.getByText('Haluatko varmasti irrottaa tämän laitteen tilistä?'),
      ).toBeInTheDocument();

      // Choice 1: Keep local progress
      fireEvent.click(screen.getByText('Säilytä edistyminen uudella tilillä'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledWith({ clearLocalProgress: false });
        expect(onClose).toHaveBeenCalled();
      });

      unmount();
      mockLogout.mockClear();
      onClose.mockClear();

      // Choice 2: Clear local progress
      render(<SyncModal show={true} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: 'Irrota tämä laite tilistä' }));
      fireEvent.click(screen.getByText('Tyhjennä laite ja aloita alusta'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledWith({ clearLocalProgress: true });
        expect(onClose).toHaveBeenCalled();
      });
    });
  });
});
