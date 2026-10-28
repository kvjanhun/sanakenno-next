import { useCallback, useEffect, useState } from 'react';
import type { AdminAchievementsResponse } from '@sanakenno/shared';
import { adminGetAchievements } from '../../api/client.js';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Saavutustilastot</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Pelaajien saavuttamat tasot ajanjaksolla ({grandTotal} tapahtumaa)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded border overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              onClick={() => setMode('users')}
              className="px-2.5 py-1 text-xs font-medium cursor-pointer"
              style={{
                backgroundColor:
                  mode === 'users' ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                color: mode === 'users' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
              }}
            >
              Pelaajat
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className="px-2.5 py-1 text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: mode === 'all' ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                color: mode === 'all' ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
              }}
            >
              Kaikki tapahtumat
            </button>
          </div>

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
                  backgroundColor: days === d ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                  color: days === d ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                }}
              >
                {d} pv
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="px-3 py-1 rounded text-xs border cursor-pointer"
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
        <div className="space-y-4">
          <div
            className="p-4 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-3 text-center"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
            }}
          >
            {Object.entries(data.totals).map(([rank, count]) => (
              <div
                key={rank}
                className="p-2 rounded border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div
                  className="text-[11px] truncate"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {rank}
                </div>
                <div className="text-base font-bold">{count}</div>
              </div>
            ))}
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
                    className="border-b transition-colors hover:bg-black/5"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="p-3 font-mono font-medium">{day.date}</td>
                    <td className="p-3 text-right font-bold">{day.total}</td>
                    {Object.keys(data.totals).map((rank) => (
                      <td
                        key={rank}
                        className="p-3 text-right font-mono"
                        style={{
                          color:
                            (day.counts[rank] ?? 0) > 0
                              ? 'var(--color-text-primary)'
                              : 'var(--color-text-secondary)',
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
