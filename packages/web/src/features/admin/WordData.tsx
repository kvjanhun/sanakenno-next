import { useCallback, useEffect, useState } from 'react';
import type { AdminFailedGuessesResponse } from '@sanakenno/shared';
import { adminGetFailedGuesses } from '../../api/client.js';
import { WordFinds } from './WordFinds.js';

interface WordDataProps {
  csrfToken: string | null;
}

export function WordData({ csrfToken }: WordDataProps): React.JSX.Element {
  const [tab, setTab] = useState<'failed' | 'words'>('failed');
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AdminFailedGuessesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFailedGuesses = useCallback(async () => {
    if (!csrfToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await adminGetFailedGuesses(csrfToken, days)) as AdminFailedGuessesResponse;
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Virhearvausten haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, [csrfToken, days]);

  useEffect(() => {
    if (tab === 'failed') {
      void loadFailedGuesses();
    }
  }, [tab, loadFailedGuesses]);

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Pelitilastot & Sanadata</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Seuraa vääriä arvauksia ja tarkastele pulmien sanojen löytöasteita
          </p>
        </div>

        <div
          className="flex rounded border overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            type="button"
            onClick={() => setTab('failed')}
            className="px-3 py-1.5 text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: tab === 'failed' ? 'var(--color-accent)' : 'var(--color-bg-primary)',
              color: tab === 'failed' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
            }}
          >
            Virhearvaukset
          </button>
          <button
            type="button"
            onClick={() => setTab('words')}
            className="px-3 py-1.5 text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: tab === 'words' ? 'var(--color-accent)' : 'var(--color-bg-primary)',
              color: tab === 'words' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
            }}
          >
            Löydetyt sanat
          </button>
        </div>
      </div>

      {tab === 'words' ? (
        <WordFinds csrfToken={csrfToken} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              Virhearvauksia yhteensä:{' '}
              <strong className="text-sm font-bold">{data?.grand_total ?? 0} kpl</strong>
            </span>

            <div className="flex gap-2 items-center">
              <div
                className="flex rounded border overflow-hidden"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className="px-2 py-1 text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor:
                        days === d ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                      color: days === d ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                    }}
                  >
                    {d} pv
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={loadFailedGuesses}
                disabled={loading}
                className="px-2.5 py-1 rounded text-xs border cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {loading ? 'Päivitetään...' : 'Päivitä'}
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
                    <th className="p-3">Päivämäärä</th>
                    <th className="p-3 text-right">Virheitä yht</th>
                    <th className="p-3">Yleisimmät väärät arvaukset</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr
                      key={day.date}
                      className="border-b transition-colors hover:bg-black/5"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <td className="p-3 font-mono font-medium">{day.date}</td>
                      <td className="p-3 text-right font-mono font-bold">{day.total_count}</td>
                      <td className="p-3">
                        {day.words.length === 0 ? (
                          <span style={{ color: 'var(--color-text-secondary)' }}>-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {day.words.slice(0, 15).map((w) => (
                              <span
                                key={w.word}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                                style={{
                                  backgroundColor: 'var(--color-bg-primary)',
                                  borderColor: 'var(--color-border)',
                                }}
                              >
                                {w.word} ({w.count})
                              </span>
                            ))}
                          </div>
                        )}
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
