import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { compareFinnishAlphabetically, type AdminWordFindsResponse } from '@sanakenno/shared';
import { adminBlockWord, adminGetSlots, adminGetWordFinds } from '../../api/client.js';
import {
  ADMIN_CARD_CLASS,
  ADMIN_CARD_STYLE,
  ADMIN_TABLE_HEAD_ROW_CLASS,
  ADMIN_TABLE_HEAD_ROW_STYLE,
  ADMIN_TABLE_ROW_CLASS,
  ADMIN_TABLE_WRAPPER_CLASS,
  AdminAlert,
  LetterTile,
  SegmentedControl,
  adminButtonClass,
  adminButtonStyle,
  useIsDesktop,
} from './AdminPrimitives.js';

interface WordFindsProps {
  csrfToken: string | null;
}

export function WordFinds({ csrfToken }: WordFindsProps): React.JSX.Element {
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const [displayNumber, setDisplayNumber] = useState(1);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'found' | 'hardest'>('hardest');
  const [blockingWord, setBlockingWord] = useState<string | null>(null);

  const slotsQuery = useQuery({
    queryKey: ['admin', 'slots', csrfToken],
    enabled: Boolean(csrfToken),
    queryFn: () => adminGetSlots(csrfToken!),
  });

  const totalPuzzles = slotsQuery.data?.total_puzzles ?? 0;

  const {
    data,
    isFetching: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['admin', 'word-finds', csrfToken, displayNumber],
    enabled: Boolean(csrfToken),
    queryFn: async () => {
      return (await adminGetWordFinds(csrfToken!, {
        display_number: displayNumber,
      })) as AdminWordFindsResponse;
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (word: string) => {
      setBlockingWord(word);
      setStatusMessage(null);
      setMutationError(null);
      await adminBlockWord(csrfToken!, word);
      return word;
    },
    onSuccess: async (word) => {
      setStatusMessage(`Sana "${word}" estetty onnistuneesti.`);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'word-finds'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'blocked'] });
    },
    onError: (err: unknown) => {
      setMutationError(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
    },
    onSettled: () => {
      setBlockingWord(null);
    },
  });

  const handleBlock = (word: string) => {
    if (!csrfToken) return;
    if (!window.confirm(`Haluatko varmasti estää sanan "${word}" tulevista peleistä?`)) return;
    blockMutation.mutate(word);
  };

  const error =
    mutationError ??
    (queryError instanceof Error
      ? queryError.message
      : queryError
        ? 'Sanalöytöjen haku epäonnistui'
        : null);

  const sortedWords = useMemo(() => {
    if (!data) return [];
    const list = [...data.words];
    if (sortMode === 'hardest') {
      return list.sort((a, b) => {
        if (a.find_count !== b.find_count) return a.find_count - b.find_count;
        return compareFinnishAlphabetically(a.word, b.word);
      });
    }
    return list.sort((a, b) => {
      if (a.find_count !== b.find_count) return b.find_count - a.find_count;
      return compareFinnishAlphabetically(a.word, b.word);
    });
  }, [data, sortMode]);

  const atLastPuzzle = totalPuzzles > 0 && displayNumber >= totalPuzzles;

  return (
    <div className="space-y-4 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base tracking-tight">Pelin löydetyt sanat</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Tarkastele ratkaistuja sanoja ja tunnista liian vaikeat tai virheelliset sanat
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={displayNumber <= 1 || loading}
            onClick={() => setDisplayNumber((d) => Math.max(1, d - 1))}
            className={adminButtonClass('sm')}
            style={adminButtonStyle('secondary', 'secondary')}
          >
            ← Edellinen peli
          </button>
          <span className="font-bold text-xs px-2 tabular-nums">Peli #{displayNumber}</span>
          <button
            type="button"
            disabled={loading || atLastPuzzle}
            onClick={() =>
              setDisplayNumber((d) => (totalPuzzles > 0 ? Math.min(totalPuzzles, d + 1) : d + 1))
            }
            className={adminButtonClass('sm')}
            style={adminButtonStyle('secondary', 'secondary')}
          >
            Seuraava peli →
          </button>
        </div>
      </div>

      {statusMessage && <AdminAlert variant="success">{statusMessage}</AdminAlert>}
      {error && <AdminAlert variant="error">{error}</AdminAlert>}

      {data && (
        <div className="space-y-4">
          <div
            className={`${ADMIN_CARD_CLASS} flex flex-wrap items-center justify-between gap-4`}
            style={ADMIN_CARD_STYLE}
          >
            <div className="flex flex-wrap items-center gap-4 text-xs tabular-nums">
              <div className="flex items-center gap-1">
                {Array.from(data.letters).map((ch) => (
                  <LetterTile
                    key={ch}
                    letter={ch}
                    size="sm"
                    isCenter={ch.toLowerCase() === data.center.toLowerCase()}
                  />
                ))}
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Löydetty: </span>
                <span className="font-bold">
                  {data.recorded_words} / {data.total_words} sanaa
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Löytöjä yht: </span>
                <span className="font-bold">{data.total_finds}</span>
              </div>
            </div>

            <SegmentedControl
              ariaLabel="Sanojen järjestys"
              value={sortMode}
              onChange={setSortMode}
              options={[
                { value: 'hardest', label: 'Vaikeimmat ensin' },
                { value: 'found', label: 'Löydetyt ensin' },
              ]}
            />
          </div>

          {!isDesktop ? (
            <div className="space-y-2 tabular-nums">
              {sortedWords.map((item) => (
                <div
                  key={item.word}
                  className="p-3 rounded-xl border flex items-center justify-between gap-3"
                  style={ADMIN_CARD_STYLE}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{item.word}</div>
                    <div className="text-xs mt-0.5 flex items-center gap-2">
                      <span style={{ color: 'var(--color-text-secondary)' }}>
                        {item.word.length} kirjainta
                      </span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>·</span>
                      <span
                        className="font-bold"
                        style={{
                          color:
                            item.find_count === 0
                              ? 'var(--color-error)'
                              : 'var(--color-text-primary)',
                        }}
                      >
                        {item.find_count === 0 ? '0 (Ei löydetty)' : `${item.find_count} löytöä`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleBlock(item.word)}
                    disabled={blockingWord === item.word}
                    className={`${adminButtonClass('sm')} shrink-0`}
                    style={adminButtonStyle('danger')}
                  >
                    Estä sana
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={ADMIN_TABLE_WRAPPER_CLASS} style={ADMIN_CARD_STYLE}>
              <table className="w-full text-left text-xs border-collapse tabular-nums">
                <thead>
                  <tr className={ADMIN_TABLE_HEAD_ROW_CLASS} style={ADMIN_TABLE_HEAD_ROW_STYLE}>
                    <th className="p-3">Sana</th>
                    <th className="p-3">Pituus</th>
                    <th className="p-3 text-right">Löytökertoja</th>
                    <th className="p-3 text-right">Toiminto</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWords.map((item) => (
                    <tr
                      key={item.word}
                      className={ADMIN_TABLE_ROW_CLASS}
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <td className="p-3 font-semibold">{item.word}</td>
                      <td className="p-3" style={{ color: 'var(--color-text-secondary)' }}>
                        {item.word.length} kirjainta
                      </td>
                      <td
                        className="p-3 text-right font-bold"
                        style={{
                          color:
                            item.find_count === 0
                              ? 'var(--color-error)'
                              : 'var(--color-text-primary)',
                        }}
                      >
                        {item.find_count === 0 ? '0 (Ei löydetty)' : item.find_count}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleBlock(item.word)}
                          disabled={blockingWord === item.word}
                          className={adminButtonClass('sm')}
                          style={adminButtonStyle('danger')}
                        >
                          Estä sana
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
