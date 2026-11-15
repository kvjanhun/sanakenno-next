import { useCallback, useEffect, useState } from 'react';
import type { AdminFailedGuessesResponse } from '@sanakenno/shared';
import { adminGetFailedGuesses } from '../../api/client.js';
import {
  ADMIN_CARD_STYLE,
  ADMIN_TABLE_HEAD_ROW_CLASS,
  ADMIN_TABLE_HEAD_ROW_STYLE,
  ADMIN_TABLE_ROW_CLASS,
  ADMIN_TABLE_WRAPPER_CLASS,
  AdminAlert,
  AdminPageHeader,
  SegmentedControl,
  adminButtonClass,
  adminButtonStyle,
} from './AdminPrimitives.js';
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
      <AdminPageHeader
        title="Pelitilastot & Sanadata"
        subtitle="Seuraa vääriä arvauksia ja tarkastele pulmien sanojen löytöasteita"
        actions={
          <SegmentedControl
            ariaLabel="Sanadatan välilehdet"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'failed', label: 'Virhearvaukset' },
              { value: 'words', label: 'Löydetyt sanat' },
            ]}
          />
        }
      />

      {tab === 'words' ? (
        <WordFinds csrfToken={csrfToken} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
              Virhearvauksia yhteensä:{' '}
              <strong className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {data?.grand_total ?? 0} kpl
              </strong>
            </span>

            <div className="flex flex-wrap gap-2 items-center">
              <SegmentedControl
                ariaLabel="Aikaväli"
                value={days}
                onChange={setDays}
                options={[
                  { value: 7, label: '7 pv' },
                  { value: 30, label: '30 pv' },
                  { value: 90, label: '90 pv' },
                ]}
              />
              <button
                type="button"
                onClick={loadFailedGuesses}
                disabled={loading}
                className={adminButtonClass('sm')}
                style={adminButtonStyle('secondary', 'secondary')}
              >
                {loading ? 'Päivitetään...' : 'Päivitä'}
              </button>
            </div>
          </div>

          {error && <AdminAlert variant="error">{error}</AdminAlert>}

          {data && (
            <div className={ADMIN_TABLE_WRAPPER_CLASS} style={ADMIN_CARD_STYLE}>
              <table className="w-full text-left text-xs border-collapse tabular-nums">
                <thead>
                  <tr className={ADMIN_TABLE_HEAD_ROW_CLASS} style={ADMIN_TABLE_HEAD_ROW_STYLE}>
                    <th className="p-3">Päivämäärä</th>
                    <th className="p-3 text-right">Virheitä yht</th>
                    <th className="p-3">Yleisimmät väärät arvaukset</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr
                      key={day.date}
                      className={ADMIN_TABLE_ROW_CLASS}
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <td className="p-3 font-medium whitespace-nowrap">{day.date}</td>
                      <td className="p-3 text-right font-bold">{day.total_count}</td>
                      <td className="p-3">
                        {day.words.length === 0 ? (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {day.words.slice(0, 15).map((w) => (
                              <span
                                key={w.word}
                                className="px-2 py-0.5 rounded-full text-[11px] font-medium border"
                                style={{
                                  backgroundColor: 'var(--color-bg-primary)',
                                  borderColor: 'var(--color-border)',
                                }}
                              >
                                {w.word}{' '}
                                <span style={{ color: 'var(--color-text-secondary)' }}>
                                  ({w.count})
                                </span>
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
