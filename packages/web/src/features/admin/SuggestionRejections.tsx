import { useCallback, useEffect, useState } from 'react';
import type { AdminSuggestionRejection } from '@sanakenno/shared';
import { adminDeleteSuggestionRejection, adminGetSuggestionRejections } from '../../api/client.js';
import {
  ADMIN_CARD_STYLE,
  ADMIN_TABLE_HEAD_ROW_CLASS,
  ADMIN_TABLE_HEAD_ROW_STYLE,
  ADMIN_TABLE_ROW_CLASS,
  ADMIN_TABLE_WRAPPER_CLASS,
  AdminAlert,
  AdminPageHeader,
  LetterTile,
  adminButtonClass,
  adminButtonStyle,
  useIsDesktop,
} from './AdminPrimitives.js';

interface SuggestionRejectionsProps {
  csrfToken: string | null;
}

export function SuggestionRejections({ csrfToken }: SuggestionRejectionsProps): React.JSX.Element {
  const isDesktop = useIsDesktop();
  const [rejections, setRejections] = useState<AdminSuggestionRejection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const loadRejections = useCallback(async () => {
    if (!csrfToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await adminGetSuggestionRejections(csrfToken)) as {
        rejections: AdminSuggestionRejection[];
      };
      setRejections(res.rejections ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Hylättyjen ehdotusten haku epäonnistui');
    } finally {
      setLoading(false);
    }
  }, [csrfToken]);

  useEffect(() => {
    void loadRejections();
  }, [loadRejections]);

  const handleRestore = async (id: number) => {
    if (!csrfToken) return;
    setRestoringId(id);
    setError(null);
    try {
      await adminDeleteSuggestionRejection(csrfToken, id);
      setRejections((prev) => prev.filter((r) => r.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Palautus epäonnistui');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6 text-sm" style={{ color: 'var(--color-text-primary)' }}>
      <AdminPageHeader
        title="Hylätyt peliehdotukset"
        subtitle={`Pelit, jotka on hylätty pysyvästi automaattisesta ehdotusjonosta (${rejections.length} kpl)`}
        actions={
          <button
            type="button"
            onClick={loadRejections}
            disabled={loading}
            className={adminButtonClass('md')}
            style={adminButtonStyle('secondary', 'secondary')}
          >
            {loading ? 'Päivitetään...' : 'Päivitä'}
          </button>
        }
      />

      {error && <AdminAlert variant="error">{error}</AdminAlert>}

      {!isDesktop ? (
        <div className="space-y-2.5 tabular-nums">
          {rejections.length === 0 ? (
            <div
              className="p-4 rounded-xl border text-center text-xs"
              style={{ ...ADMIN_CARD_STYLE, color: 'var(--color-text-secondary)' }}
            >
              {loading ? 'Ladataan hylkäyksiä...' : 'Ei hylättyjä ehdotuksia.'}
            </div>
          ) : (
            rejections.map((r) => (
              <div
                key={r.id}
                className="p-3.5 rounded-xl border flex items-center justify-between gap-3"
                style={ADMIN_CARD_STYLE}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <LetterTile letter={r.center} isCenter size="sm" />
                    <span className="text-xs font-bold tracking-widest uppercase">
                      {r.letters_key}
                    </span>
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    Hylätty {r.rejected_at.slice(0, 10)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(r.id)}
                  disabled={restoringId === r.id}
                  className={`${adminButtonClass('sm')} shrink-0`}
                  style={adminButtonStyle('secondary', 'primary')}
                >
                  {restoringId === r.id ? 'Palautetaan...' : 'Palauta jonoon'}
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className={ADMIN_TABLE_WRAPPER_CLASS} style={ADMIN_CARD_STYLE}>
          <table className="w-full text-left text-xs border-collapse tabular-nums">
            <thead>
              <tr className={ADMIN_TABLE_HEAD_ROW_CLASS} style={ADMIN_TABLE_HEAD_ROW_STYLE}>
                <th className="p-3">Kirjaimet</th>
                <th className="p-3">Keskuskirjain</th>
                <th className="p-3">Hylätty</th>
                <th className="p-3 text-right">Toiminto</th>
              </tr>
            </thead>
            <tbody>
              {rejections.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="p-4 text-center"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {loading ? 'Ladataan hylkäyksiä...' : 'Ei hylättyjä ehdotuksia.'}
                  </td>
                </tr>
              ) : (
                rejections.map((r) => (
                  <tr
                    key={r.id}
                    className={ADMIN_TABLE_ROW_CLASS}
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="p-3 font-bold tracking-widest uppercase">{r.letters_key}</td>
                    <td className="p-3">
                      <LetterTile letter={r.center} isCenter size="sm" />
                    </td>
                    <td className="p-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {r.rejected_at.slice(0, 10)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(r.id)}
                        disabled={restoringId === r.id}
                        className={adminButtonClass('sm')}
                        style={adminButtonStyle('secondary', 'primary')}
                      >
                        {restoringId === r.id ? 'Palautetaan...' : 'Palauta jonoon'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
