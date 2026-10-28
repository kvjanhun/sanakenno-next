import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminWordFindsResponse } from '@sanakenno/shared';
import { adminBlockWord, adminGetWordFinds } from '../../api/client.js';

interface WordFindsProps {
  csrfToken: string | null;
}

export function WordFinds({ csrfToken }: WordFindsProps): React.JSX.Element {
  const [displayNumber, setDisplayNumber] = useState(1);
  const [data, setData] = useState<AdminWordFindsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    try {
      await adminBlockWord(csrfToken, word);
      alert(`Sana "${word}" estetty onnistuneesti.`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Sanan esto epäonnistui');
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
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base">Pelin löydetyt sanat</h3>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Tarkastele ratkaistuja sanoja ja tunnista liian vaikeat tai virheelliset sanat
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={displayNumber <= 1 || loading}
            onClick={() => setDisplayNumber((d) => Math.max(1, d - 1))}
            className="px-2.5 py-1.5 rounded border text-xs cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            ← Edellinen peli
          </button>
          <span className="font-bold text-xs px-2">Peli #{displayNumber}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => setDisplayNumber((d) => d + 1)}
            className="px-2.5 py-1.5 rounded border text-xs cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
            }}
          >
            Seuraava peli →
          </button>
        </div>
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

      {data && (
        <div className="space-y-4">
          <div
            className="p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Kirjaimet: </span>
                <span className="font-mono font-bold tracking-widest uppercase">
                  {data.letters}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Keskus: </span>
                <span className="font-bold uppercase" style={{ color: 'var(--color-accent)' }}>
                  {data.center}
                </span>
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

            <div
              className="flex rounded border overflow-hidden"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                type="button"
                onClick={() => setSortMode('hardest')}
                className="px-2.5 py-1 text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor:
                    sortMode === 'hardest' ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                  color:
                    sortMode === 'hardest'
                      ? 'var(--color-bg-primary)'
                      : 'var(--color-text-primary)',
                }}
              >
                Vaikeimmat ensin
              </button>
              <button
                type="button"
                onClick={() => setSortMode('found')}
                className="px-2.5 py-1 text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor:
                    sortMode === 'found' ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                  color:
                    sortMode === 'found' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                Löydetyt ensin
              </button>
            </div>
          </div>

          <div
            className="rounded-xl border overflow-x-auto"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
            }}
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
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
                    className="border-b transition-colors hover:bg-black/5"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="p-3 font-mono font-bold">{item.word}</td>
                    <td className="p-3 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.word.length} kirjainta
                    </td>
                    <td
                      className="p-3 text-right font-mono font-bold"
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
                        className="px-2.5 py-1 rounded text-xs font-medium cursor-pointer border"
                        style={{
                          backgroundColor: 'var(--color-bg-primary)',
                          color: 'var(--color-error)',
                          borderColor: 'var(--color-border)',
                        }}
                      >
                        Estä sana
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
