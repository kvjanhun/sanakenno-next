import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminWordFindsResponse } from '@sanakenno/shared';
import { adminBlockWord, adminGetWordFinds } from '../../api/client.js';
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
  const [displayNumber, setDisplayNumber] = useState(1);
  const [data, setData] = useState<AdminWordFindsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'found' | 'hardest'>('hardest');
  const [blockingWord, setBlockingWord] = useState<string | null>(null);

  const loadWordFinds = useCallback(async () => {
    if (!csrfToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await adminGetWordFinds(csrfToken, {
        display_number: displayNumber,
      })) as AdminWordFindsResponse;
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sanalöytöjen haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, [csrfToken, displayNumber]);

  useEffect(() => {
    void loadWordFinds();
  }, [loadWordFinds]);

  const handleBlock = async (word: string) => {
    if (!csrfToken) return;
    if (!window.confirm(`Haluatko varmasti estää sanan "${word}" tulevista peleistä?`)) return;
    setBlockingWord(word);
    setStatusMessage(null);
    setError(null);
    try {
      await adminBlockWord(csrfToken, word);
      setStatusMessage(`Sana "${word}" estetty onnistuneesti.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
    } finally {
      setBlockingWord(null);
    }
  };

  const sortedWords = useMemo(() => {
    if (!data) return [];
    const list = [...data.words];
    if (sortMode === 'hardest') {
      return list.sort((a, b) => {
        if (a.find_count !== b.find_count) return a.find_count - b.find_count;
        return a.word.localeCompare(b.word, 'fi');
      });
    }
    return list.sort((a, b) => {
      if (a.find_count !== b.find_count) return b.find_count - a.find_count;
      return a.word.localeCompare(b.word, 'fi');
    });
  }, [data, sortMode]);

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
            disabled={loading}
            onClick={() => setDisplayNumber((d) => d + 1)}
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
