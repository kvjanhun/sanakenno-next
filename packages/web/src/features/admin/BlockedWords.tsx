import { useCallback, useEffect, useState } from 'react';
import { adminBlockWord, adminGetBlocked, adminUnblockWord } from '../../api/client.js';
import {
  ADMIN_CARD_CLASS,
  ADMIN_CARD_STYLE,
  ADMIN_INPUT_CLASS,
  ADMIN_INPUT_STYLE,
  AdminAlert,
  AdminPageHeader,
  adminButtonClass,
  adminButtonStyle,
} from './AdminPrimitives.js';
import { useAdminStore } from './useAdminStore.js';

export function BlockedWords(): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);
  const [blocked, setBlocked] = useState<Array<{ id: number; word: string; blocked_at: string }>>(
    [],
  );
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBlocked = useCallback(async () => {
    if (!csrfToken) return;
    try {
      const res = await adminGetBlocked(csrfToken);
      setBlocked(res.blocked);
    } catch {
      // ignore
    }
  }, [csrfToken]);

  useEffect(() => {
    void loadBlocked();
  }, [loadBlocked]);

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csrfToken || !newWord.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await adminBlockWord(csrfToken, newWord.trim());
      setNewWord('');
      void loadBlocked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (id: number) => {
    if (!csrfToken) return;
    setLoading(true);
    setError(null);
    try {
      await adminUnblockWord(csrfToken, id);
      void loadBlocked();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Eston poisto epäonnistui');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <AdminPageHeader title="Estetyt sanat" subtitle={`Yhteensä: ${blocked.length} sanaa`} />

      {error && <AdminAlert variant="error">{error}</AdminAlert>}

      <form
        onSubmit={handleBlock}
        className={`${ADMIN_CARD_CLASS} flex gap-3 items-center`}
        style={ADMIN_CARD_STYLE}
      >
        <input
          type="text"
          placeholder="Estä uusi sana..."
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          className={`flex-1 ${ADMIN_INPUT_CLASS}`}
          style={ADMIN_INPUT_STYLE}
        />
        <button
          type="submit"
          disabled={loading || !newWord.trim()}
          className={adminButtonClass('md')}
          style={adminButtonStyle('primary')}
        >
          Estä sana
        </button>
      </form>

      <div className={ADMIN_CARD_CLASS} style={ADMIN_CARD_STYLE}>
        {blocked.length === 0 ? (
          <p className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
            Ei vielä estettyjä sanoja.
          </p>
        ) : (
          <div>
            {blocked.map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex justify-between items-center border-b last:border-b-0"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="text-sm font-medium">{item.word}</span>
                <button
                  type="button"
                  onClick={() => handleUnblock(item.id)}
                  disabled={loading}
                  className={adminButtonClass('sm')}
                  style={adminButtonStyle('danger')}
                >
                  Poista esto
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
