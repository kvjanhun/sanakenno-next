import { useCallback, useEffect, useState } from 'react';
import type { AdminSuggestionRejection } from '@sanakenno/shared';
import { adminDeleteSuggestionRejection, adminGetSuggestionRejections } from '../../api/client.js';

interface SuggestionRejectionsProps {
  csrfToken: string | null;
}

export function SuggestionRejections({ csrfToken }: SuggestionRejectionsProps): React.JSX.Element {
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold">Hylätyt peliehdotukset</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Pelit, jotka on hylätty pysyvästi automaattisesta ehdotusjonosta ({rejections.length}{' '}
            kpl)
          </p>
        </div>
        <button
          type="button"
          onClick={loadRejections}
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
                  className="border-b transition-colors hover:bg-black/5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <td className="p-3 font-mono font-bold tracking-wider uppercase">
                    {r.letters_key}
                  </td>
                  <td className="p-3">
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold uppercase border"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      {r.center}
                    </span>
                  </td>
                  <td className="p-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {r.rejected_at.slice(0, 10)}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRestore(r.id)}
                      disabled={restoringId === r.id}
                      className="px-3 py-1 rounded text-xs font-medium cursor-pointer border disabled:opacity-50"
                      style={{
                        backgroundColor: 'var(--color-bg-primary)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
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
    </div>
  );
}
