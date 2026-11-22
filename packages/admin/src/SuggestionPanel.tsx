import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminSuggestionResponse } from '@sanakenno/shared';
import { adminGetSuggestion, adminRejectSuggestion } from './api/admin-client.js';
import {
  ADMIN_CARD_CLASS,
  ADMIN_CARD_STYLE,
  ADMIN_SUBCARD_CLASS,
  ADMIN_SUBCARD_STYLE,
  AdminAlert,
  LetterTile,
  adminButtonClass,
  adminButtonStyle,
} from './AdminPrimitives.js';

interface SuggestionPanelProps {
  csrfToken: string | null;
  onAddSuggestion: (letters: string, center: string) => Promise<void>;
  onPreviewSuggestion?: (letters: string, center: string) => void;
}

export function SuggestionPanel({
  csrfToken,
  onAddSuggestion,
  onPreviewSuggestion,
}: SuggestionPanelProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [suggestion, setSuggestion] = useState<AdminSuggestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const suggestMutation = useMutation({
    mutationFn: async (declinedList: string[]) => {
      return (await adminGetSuggestion(csrfToken!, {
        declined: declinedList,
      })) as AdminSuggestionResponse;
    },
    onSuccess: (res) => {
      setSuggestion(res);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Ehdotuksen haku epäonnistui');
      setSuggestion(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (item: AdminSuggestionResponse) => {
      await adminRejectSuggestion(csrfToken!, item.letters, item.center);
      return item;
    },
    onSuccess: async (item) => {
      const nextDeclined = appendDeclined(item);
      setSuggestion(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'suggestion-rejections'] });
      await suggestMutation.mutateAsync(nextDeclined).catch(() => undefined);
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Ehdotuksen hylkäys epäonnistui');
    },
  });

  const loading = suggestMutation.isPending || rejectMutation.isPending || adding;

  const appendDeclined = (item: AdminSuggestionResponse): string[] => {
    const key = `${item.letters_key}:${item.center}`;
    if (declined.includes(key)) return declined;
    const next = [...declined, key];
    setDeclined(next);
    return next;
  };

  const handleSuggestClick = () => {
    if (!csrfToken) return;
    const nextDeclined = suggestion ? appendDeclined(suggestion) : declined;
    setError(null);
    suggestMutation.mutate(nextDeclined);
  };

  const handleAdd = async () => {
    if (!csrfToken || !suggestion) return;
    setAdding(true);
    setError(null);
    try {
      await onAddSuggestion(suggestion.letters.join(','), suggestion.center);
      appendDeclined(suggestion);
      setSuggestion(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pelin lisäys epäonnistui');
    } finally {
      setAdding(false);
    }
  };

  const handleReject = () => {
    if (!csrfToken || !suggestion) return;
    setError(null);
    rejectMutation.mutate(suggestion);
  };

  return (
    <div className={`${ADMIN_CARD_CLASS} space-y-4`} style={ADMIN_CARD_STYLE}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base tracking-tight">Peliavustaja</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Ehdota automaattisesti laadukkaita pelejä kiertoon
          </p>
        </div>
        <button
          type="button"
          onClick={handleSuggestClick}
          disabled={loading}
          className={adminButtonClass('md')}
          style={adminButtonStyle('primary')}
        >
          {loading ? 'Haetaan...' : suggestion ? 'Ehdota toista' : 'Ehdota peliä'}
        </button>
      </div>

      {error && <AdminAlert variant="error">{error}</AdminAlert>}

      {suggestion && (
        <div className={`${ADMIN_SUBCARD_CLASS} space-y-4`} style={ADMIN_SUBCARD_STYLE}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="text-[11px] uppercase font-semibold tracking-wide"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Kirjaimet:
              </span>
              <div className="flex gap-1">
                {suggestion.letters.map((ch) => (
                  <LetterTile
                    key={ch}
                    letter={ch}
                    isCenter={ch.toLowerCase() === suggestion.center.toLowerCase()}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={loading}
                className={adminButtonClass('sm')}
                style={adminButtonStyle('primary')}
              >
                Lisää peli
              </button>
              {onPreviewSuggestion && (
                <button
                  type="button"
                  onClick={() =>
                    onPreviewSuggestion(suggestion.letters.join(','), suggestion.center)
                  }
                  disabled={loading}
                  className={adminButtonClass('sm')}
                  style={adminButtonStyle('secondary', 'secondary')}
                >
                  Esikatsele ehdotus
                </button>
              )}
              <button
                type="button"
                onClick={handleReject}
                disabled={loading}
                className={adminButtonClass('sm')}
                style={adminButtonStyle('danger')}
              >
                Hylkää pysyvästi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div
              className="p-2.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div style={{ color: 'var(--color-text-secondary)' }}>Sanoja</div>
              <div className="font-bold text-sm tabular-nums">{suggestion.word_count}</div>
            </div>
            <div
              className="p-2.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div style={{ color: 'var(--color-text-secondary)' }}>Maksimipisteet</div>
              <div className="font-bold text-sm tabular-nums">{suggestion.max_score}</div>
            </div>
            <div
              className="p-2.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div style={{ color: 'var(--color-text-secondary)' }}>Pangrammeja</div>
              <div className="font-bold text-sm tabular-nums">{suggestion.pangram_count}</div>
            </div>
            <div
              className="p-2.5 rounded-lg border"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
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

          {suggestion.pangrams && suggestion.pangrams.length > 0 && (
            <div
              className="pt-2.5 border-t space-y-1"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span
                className="text-xs font-semibold"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Pangrammit:
              </span>
              <div className="text-sm font-bold" style={{ color: 'var(--color-accent)' }}>
                {suggestion.pangrams.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
