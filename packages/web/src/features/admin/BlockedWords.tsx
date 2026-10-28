import { useCallback, useEffect, useState } from 'react';
import { adminBlockWord, adminGetBlocked, adminUnblockWord } from '../../api/client.js';
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
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">Estetyt sanat</h2>
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Yhteensä: {blocked.length} sanaa
        </span>
      </div>

      {error && (
        <div
          className="p-3 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-error)',
            borderColor: 'var(--color-border)',
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleBlock}
        className="p-4 rounded-xl border flex gap-3 items-center"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        <input
          type="text"
          placeholder="Estä uusi sana..."
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded border text-sm"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={loading || !newWord.trim()}
          className="px-4 py-1.5 rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
        >
          Estä sana
        </button>
      </form>

      <div
        className="p-4 rounded-xl border space-y-2"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
        }}
      >
        {blocked.length === 0 ? (
          <p className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
            Ei vielä estettyjä sanoja.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {blocked.map((item) => (
              <div key={item.id} className="py-2 flex justify-between items-center">
                <span className="font-mono text-sm">{item.word}</span>
                <button
                  type="button"
                  onClick={() => handleUnblock(item.id)}
                  disabled={loading}
                  className="px-2.5 py-1 rounded text-xs font-medium cursor-pointer border"
                  style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-error)',
                  }}
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
