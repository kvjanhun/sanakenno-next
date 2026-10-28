import { useCallback, useEffect, useState } from 'react';
import { adminGetSchedule } from '../../api/client.js';
import { useAdminStore } from './useAdminStore.js';

export function Schedule(): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);
  const [schedule, setSchedule] = useState<
    Array<{
      date: string;
      slot: number;
      display_number: number;
      letters: string[] | null;
      center: string | null;
      word_count: number;
      max_score: number;
      pangram_count: number;
      is_today: boolean;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  const loadSchedule = useCallback(async () => {
    if (!csrfToken) return;
    setLoading(true);
    try {
      const res = await adminGetSchedule(csrfToken, 14);
      setSchedule(res.schedule);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">14 päivän kierrosaikataulu</h2>
        <button
          type="button"
          onClick={loadSchedule}
          disabled={loading}
          className="px-3 py-1.5 rounded text-xs border cursor-pointer"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          {loading ? 'Päivitetään...' : 'Päivitä'}
        </button>
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
              <th className="p-3">Peli (#)</th>
              <th className="p-3">Slotti</th>
              <th className="p-3">Keskus</th>
              <th className="p-3">Kirjaimet</th>
              <th className="p-3">Sanoja</th>
              <th className="p-3">Pisteet</th>
              <th className="p-3">Pangrammit</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {schedule.map((entry) => (
              <tr
                key={entry.date}
                style={{
                  backgroundColor: entry.is_today ? 'var(--color-bg-tertiary)' : 'transparent',
                }}
              >
                <td className="p-3 font-mono font-medium">
                  {entry.date}{' '}
                  {entry.is_today && (
                    <span
                      className="ml-1 text-xs font-bold"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      (Tänään)
                    </span>
                  )}
                </td>
                <td className="p-3 font-semibold">#{entry.display_number}</td>
                <td className="p-3 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  {entry.slot}
                </td>
                <td className="p-3 font-bold uppercase" style={{ color: 'var(--color-accent)' }}>
                  {entry.center ?? '—'}
                </td>
                <td className="p-3 font-mono">{entry.letters ? entry.letters.join(', ') : '—'}</td>
                <td className="p-3">{entry.word_count}</td>
                <td className="p-3">{entry.max_score}</td>
                <td className="p-3">{entry.pangram_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
