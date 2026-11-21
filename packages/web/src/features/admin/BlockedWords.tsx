import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const [newWord, setNewWord] = useState('');
  const [filter, setFilter] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, error: queryError } = useQuery({
    queryKey: ['admin', 'blocked', csrfToken],
    enabled: Boolean(csrfToken),
    queryFn: () => adminGetBlocked(csrfToken!),
  });

  const blockMutation = useMutation({
    mutationFn: (word: string) => adminBlockWord(csrfToken!, word),
    onSuccess: async () => {
      setNewWord('');
      setMutationError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blocked'] });
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (id: number) => adminUnblockWord(csrfToken!, id),
    onSuccess: async () => {
      setMutationError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'blocked'] });
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof Error ? err.message : 'Eston poisto epäonnistui');
    },
  });

  const blocked = data?.blocked ?? [];
  const loading = blockMutation.isPending || unblockMutation.isPending;
  const error =
    mutationError ??
    (queryError instanceof Error
      ? queryError.message
      : queryError
        ? 'Estettyjen sanojen haku epäonnistui'
        : null);

  const handleBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csrfToken || !newWord.trim()) return;
    setMutationError(null);
    blockMutation.mutate(newWord.trim());
  };

  const handleUnblock = (id: number) => {
    if (!csrfToken) return;
    setMutationError(null);
    unblockMutation.mutate(id);
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

      <div className={`${ADMIN_CARD_CLASS} space-y-4`} style={ADMIN_CARD_STYLE}>
        {blocked.length === 0 ? (
          <p className="text-xs italic" style={{ color: 'var(--color-text-secondary)' }}>
            Ei vielä estettyjä sanoja.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <input
                type="search"
                placeholder="Suodata estettyjä sanoja..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className={`w-full sm:w-64 ${ADMIN_INPUT_CLASS}`}
                style={ADMIN_INPUT_STYLE}
              />
              <span
                className="text-xs tabular-nums"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Näytetään{' '}
                {
                  blocked.filter((item) =>
                    item.word.toLowerCase().includes(filter.trim().toLowerCase()),
                  ).length
                }{' '}
                / {blocked.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {blocked
                .filter((item) => item.word.toLowerCase().includes(filter.trim().toLowerCase()))
                .map((item) => (
                  <div
                    key={item.id}
                    className="px-3 py-2 rounded-xl border flex justify-between items-center gap-2"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    <span className="text-sm font-medium truncate">{item.word}</span>
                    <button
                      type="button"
                      onClick={() => handleUnblock(item.id)}
                      disabled={loading}
                      className={`${adminButtonClass('sm')} shrink-0`}
                      style={adminButtonStyle('danger')}
                    >
                      Poista esto
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
