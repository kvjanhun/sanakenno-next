import { useCallback, useEffect, useState } from 'react';
import type { AdminAchievementsResponse } from '@sanakenno/shared';
import { adminGetAchievements } from '../../api/client.js';
import {
  ADMIN_CARD_CLASS,
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

interface StatsProps {
  csrfToken: string | null;
}

export function Stats({ csrfToken }: StatsProps): React.JSX.Element {
  const [days, setDays] = useState(7);
  const [mode, setMode] = useState<'users' | 'all'>('users');
  const [data, setData] = useState<AdminAchievementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!csrfToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await adminGetAchievements(csrfToken, days, mode)) as AdminAchievementsResponse;
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tilastojen haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, [csrfToken, days, mode]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const grandTotal = data?.daily.reduce((sum, d) => sum + d.total, 0) ?? 0;

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <AdminPageHeader
        title="Saavutustilastot"
        subtitle={`Pelaajien saavuttamat tasot ajanjaksolla (${grandTotal} tapahtumaa)`}
        actions={
          <>
            <SegmentedControl
              ariaLabel="Näyttötila"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'users', label: 'Pelaajat' },
                { value: 'all', label: 'Kaikki tapahtumat' },
              ]}
            />
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
              onClick={loadStats}
              disabled={loading}
              className={adminButtonClass('md')}
              style={adminButtonStyle('secondary', 'secondary')}
            >
              {loading ? 'Päivitetään...' : 'Päivitä'}
            </button>
          </>
        }
      />

      {error && <AdminAlert variant="error">{error}</AdminAlert>}

      {data && (
        <div className="space-y-4">
          <div
            className={`${ADMIN_CARD_CLASS} grid grid-cols-2 sm:grid-cols-4 gap-3 text-center`}
            style={ADMIN_CARD_STYLE}
          >
            {Object.entries(data.totals).map(([rank, count]) => (
              <div
                key={rank}
                className="p-2.5 rounded-xl border"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div
                  className="text-[11px] font-medium truncate"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {rank}
                </div>
                <div className="text-base font-bold tabular-nums mt-0.5">{count}</div>
              </div>
            ))}
          </div>

          <div className={ADMIN_TABLE_WRAPPER_CLASS} style={ADMIN_CARD_STYLE}>
            <table className="w-full text-left text-xs border-collapse tabular-nums">
              <thead>
                <tr className={ADMIN_TABLE_HEAD_ROW_CLASS} style={ADMIN_TABLE_HEAD_ROW_STYLE}>
                  <th className="p-3">Päivämäärä</th>
                  <th className="p-3 text-right">Yhteensä</th>
                  {Object.keys(data.totals).map((rank) => (
                    <th key={rank} className="p-3 text-right">
                      {rank}
                    </th>
                  ))}
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
                    <td className="p-3 text-right font-bold">{day.total}</td>
                    {Object.keys(data.totals).map((rank) => (
                      <td
                        key={rank}
                        className="p-3 text-right"
                        style={{
                          color:
                            (day.counts[rank] ?? 0) > 0
                              ? 'var(--color-text-primary)'
                              : 'var(--color-text-tertiary)',
                        }}
                      >
                        {day.counts[rank] ?? 0}
                      </td>
                    ))}
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
