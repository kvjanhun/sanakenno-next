import { useCallback, useState } from 'react';
import { useAuthStore } from './useAuthStore.js';

export interface ConnectBannerProps {
  token: string | null;
  onClose: () => void;
}

export function ConnectBanner({ token, onClose }: ConnectBannerProps): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await useAuthStore.getState().useTransfer(token);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Yhdistäminen epäonnistui');
      setLoading(false);
    }
  }, [token, onClose]);

  if (!token) return <>{null}</>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-banner-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-6 space-y-4 shadow-xl text-sm"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
        }}
      >
        <h2 id="connect-banner-title" className="text-lg font-semibold">
          Yhdistä laite tiliisi
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Haluatko yhdistää tämän laitteen toiseen Sanakenno-tiliin? Kaikki löydetyt sanat ja
          tilastot yhdistetään.
        </p>

        {error && (
          <div
            className="p-3 rounded-lg text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-error)',
            }}
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded text-xs cursor-pointer font-medium"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Peruuta
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={loading}
            className="px-4 py-2 rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-bg-primary)',
            }}
          >
            {loading ? 'Yhdistetään...' : 'Yhdistä laite'}
          </button>
        </div>
      </div>
    </div>
  );
}
