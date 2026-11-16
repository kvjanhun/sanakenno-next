import { useCallback, useEffect, useState } from 'react';
import { adminGetSchedule } from '../../api/client.js';
import {
  ADMIN_CARD_STYLE,
  ADMIN_TABLE_HEAD_ROW_CLASS,
  ADMIN_TABLE_HEAD_ROW_STYLE,
  ADMIN_TABLE_ROW_CLASS,
  ADMIN_TABLE_WRAPPER_CLASS,
  AdminPageHeader,
  LetterTile,
  adminButtonClass,
  adminButtonStyle,
  useIsDesktop,
} from './AdminPrimitives.js';
import { useAdminStore } from './useAdminStore.js';

export function Schedule(): React.JSX.Element {
  const csrfToken = useAdminStore((s) => s.csrfToken);
  const isDesktop = useIsDesktop();
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
      <AdminPageHeader
        title="14 päivän kierrosaikataulu"
        subtitle="Seuraavan kahden viikon aktiiviset päivän pelit"
        actions={
          <button
            type="button"
            onClick={loadSchedule}
            disabled={loading}
            className={adminButtonClass('md')}
            style={adminButtonStyle('secondary', 'secondary')}
          >
            {loading ? 'Päivitetään...' : 'Päivitä'}
          </button>
        }
      />

      {!isDesktop ? (
        <div className="space-y-2.5 tabular-nums">
          {schedule.map((entry) => (
            <div
              key={entry.date}
              className="p-3.5 rounded-xl border space-y-2.5"
              style={{
                borderColor: entry.is_today ? 'var(--color-accent)' : 'var(--color-border)',
                backgroundColor: entry.is_today
                  ? 'color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-secondary))'
                  : 'var(--color-bg-secondary)',
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span>{entry.date}</span>
                  {entry.is_today && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-on-accent)',
                      }}
                    >
                      (Tänään)
                    </span>
                  )}
                </div>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>
                    #{entry.display_number}
                  </strong>{' '}
                  · Slotti {entry.slot}
                </span>
              </div>

              {entry.letters && (
                <div className="flex flex-wrap items-center gap-1">
                  {entry.letters.map((ch) => (
                    <LetterTile
                      key={ch}
                      letter={ch}
                      size="sm"
                      isCenter={
                        entry.center !== null && ch.toLowerCase() === entry.center.toLowerCase()
                      }
                    />
                  ))}
                </div>
              )}

              <div
                className="flex items-center gap-3 text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <span>{entry.word_count} sanaa</span>
                <span>·</span>
                <span>{entry.max_score} p</span>
                <span>·</span>
                <span>{entry.pangram_count} pg</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={ADMIN_TABLE_WRAPPER_CLASS} style={ADMIN_CARD_STYLE}>
          <table className="w-full text-left text-xs border-collapse tabular-nums">
            <thead>
              <tr className={ADMIN_TABLE_HEAD_ROW_CLASS} style={ADMIN_TABLE_HEAD_ROW_STYLE}>
                <th className="p-3">Päivämäärä</th>
                <th className="p-3">Peli (#)</th>
                <th className="p-3">Slotti</th>
                <th className="p-3">Kirjaimet</th>
                <th className="p-3 text-right">Sanoja</th>
                <th className="p-3 text-right">Pisteet</th>
                <th className="p-3 text-right">Pangrammit</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((entry) => (
                <tr
                  key={entry.date}
                  className={ADMIN_TABLE_ROW_CLASS}
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: entry.is_today
                      ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                      : 'transparent',
                  }}
                >
                  <td className="p-3 font-medium whitespace-nowrap">
                    {entry.date}{' '}
                    {entry.is_today && (
                      <span
                        className="ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{
                          backgroundColor: 'var(--color-accent)',
                          color: 'var(--color-on-accent)',
                        }}
                      >
                        (Tänään)
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-semibold">#{entry.display_number}</td>
                  <td className="p-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {entry.slot}
                  </td>
                  <td className="p-3">
                    {entry.letters ? (
                      <div className="flex items-center gap-1">
                        {entry.letters.map((ch) => (
                          <LetterTile
                            key={ch}
                            letter={ch}
                            size="sm"
                            isCenter={
                              entry.center !== null &&
                              ch.toLowerCase() === entry.center.toLowerCase()
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 text-right font-medium">{entry.word_count}</td>
                  <td className="p-3 text-right">{entry.max_score}</td>
                  <td className="p-3 text-right">{entry.pangram_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
