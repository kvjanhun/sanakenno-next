import { useState } from 'react';
import type { AdminSuggestionResponse } from '@sanakenno/shared';
import { adminGetSuggestion, adminRejectSuggestion } from '../../api/client.js';

interface SuggestionPanelProps {
  csrfToken: string | null;
  onSelectSuggestion: (letters: string, center: string) => void;
}

export function SuggestionPanel({
  csrfToken,
  onSelectSuggestion,
}: SuggestionPanelProps): React.JSX.Element {
  const [suggestion, setSuggestion] = useState<AdminSuggestionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spoilers, setSpoilers] = useState(false);
  const [declined, setDeclined] = useState<string[]>([]);

  const fetchSuggestion = async (includeSpoilers = spoilers) => {
    if (!csrfToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = (await adminGetSuggestion(csrfToken, {
        declined,
        include_pangrams: includeSpoilers,
      })) as AdminSuggestionResponse;
      setSuggestion(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ehdotuksen haku epäonnistui');
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!csrfToken || !suggestion) return;
    setLoading(true);
    try {
      await adminRejectSuggestion(csrfToken, suggestion.letters, suggestion.center);
      setDeclined((prev) => [...prev, `${suggestion.letters_key}:${suggestion.center}`]);
      setSuggestion(null);
      void fetchSuggestion();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ehdotuksen hylkäys epäonnistui');
      setLoading(false);
    }
  };

  const toggleSpoilers = async () => {
    const next = !spoilers;
    setSpoilers(next);
    if (next && suggestion && !suggestion.pangrams) {
      await fetchSuggestion(true);
    }
  };

  return (
    <div
      className="p-5 rounded-2xl border space-y-4"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base tracking-tight">Peliavustaja</h3>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Ehdota automaattisesti laadukkaita pelejä kiertoon ilman ratkaisupaljastuksia
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchSuggestion(spoilers)}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-opacity"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-bg-primary)',
          }}
        >
          {loading ? 'Haetaan...' : suggestion ? 'Ehdota toista' : 'Ehdota peliä'}
        </button>
      </div>

      {error && (
        <div
          className="p-3 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-error)',
            borderColor: 'var(--color-border)',
          }}
        >
          {error}
        </div>
      )}

      {suggestion && (
        <div
          className="p-4 rounded-xl space-y-4 border"
          style={{
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="text-xs uppercase font-bold"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Kirjaimet:
              </span>
              <div className="flex gap-1">
                {suggestion.letters.map((ch) => {
                  const isCenter = ch.toLowerCase() === suggestion.center.toLowerCase();
                  return (
                    <span
                      key={ch}
                      className="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold uppercase border"
                      style={{
                        backgroundColor: isCenter
                          ? 'var(--color-accent)'
                          : 'var(--color-bg-secondary)',
                        color: isCenter ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      {ch}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSelectSuggestion(suggestion.letters.join(','), suggestion.center)}
                className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-bg-primary)',
                }}
              >
                Käytä ehdotusta
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={loading}
                className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer border"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-error)',
                  borderColor: 'var(--color-border)',
                }}
              >
                Hylkää pysyvästi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Sanoja</div>
              <div className="font-bold text-sm">{suggestion.word_count}</div>
            </div>
            <div className="p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Maksimipisteet</div>
              <div className="font-bold text-sm">{suggestion.max_score}</div>
            </div>
            <div className="p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Pangrammeja</div>
              <div className="font-bold text-sm">{suggestion.pangram_count}</div>
            </div>
            <div className="p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
              <div style={{ color: 'var(--color-text-secondary)' }}>Laatu</div>
              <div className="font-bold text-xs">{suggestion.quality_label}</div>
            </div>
          </div>

          {suggestion.reasons.length > 0 && (
            <div className="space-y-1">
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Perusteet:
              </span>
              <ul
                className="list-disc list-inside text-xs space-y-0.5"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {suggestion.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              onClick={toggleSpoilers}
              className="text-xs font-medium cursor-pointer underline"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {spoilers ? 'Piilota pangrammit' : 'Näytä pangrammit (Spoileri)'}
            </button>
            {spoilers && suggestion.pangrams && (
              <div
                className="mt-2 text-xs font-mono font-medium"
                style={{ color: 'var(--color-accent)' }}
              >
                {suggestion.pangrams.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
