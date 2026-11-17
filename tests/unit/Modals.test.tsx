import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsModal } from '../../packages/web/src/features/modals/SettingsModal.js';
import { useAuthStore } from '../../packages/web/src/features/player-sync/useAuthStore.js';

describe('SettingsModal live cloud sync indicator', () => {
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
});
