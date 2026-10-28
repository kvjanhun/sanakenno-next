import { useCallback, useRef } from 'react';
import type { ArchiveEntry } from '@sanakenno/shared';
import { useDialogFocusTrap } from './ModalShell.js';

/** Format a YYYY-MM-DD date string as Finnish short date (e.g. "ma 31.3."). */
export function formatFinnishDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

export interface ArchiveActionSheetProps {
  show: boolean;
  entry: ArchiveEntry | null;
  isRevealed: boolean;
  confirmReveal: boolean;
  onPlay: () => void;
  onReveal: () => void;
  onConfirmReveal: () => void;
  onCancelConfirm: () => void;
  onClose: () => void;
}

export function ArchiveActionSheet({
  show,
  entry,
  isRevealed,
  confirmReveal,
  onPlay,
  onReveal,
  onConfirmReveal,
  onCancelConfirm,
  onClose,
}: ArchiveActionSheetProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const handleEscape = useCallback(() => {
    if (confirmReveal) onCancelConfirm();
    else onClose();
  }, [confirmReveal, onCancelConfirm, onClose]);

  const handleOverlayClose = useCallback(() => {
    if (confirmReveal) onCancelConfirm();
    else onClose();
  }, [confirmReveal, onCancelConfirm, onClose]);

  useDialogFocusTrap(dialogRef, onClose, handleEscape, show && entry !== null);

  if (!show || !entry) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgb(0 0 0 / 0.5)' }}
      onClick={handleOverlayClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-5 flex flex-col gap-3"
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="puzzle-action-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="puzzle-action-title"
          className="text-sm text-center"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {confirmReveal
            ? 'Paljasta vastaukset?'
            : `Kenno #${entry.display_number} · ${formatFinnishDate(entry.date)}`}
        </h3>

        {confirmReveal ? (
          <>
            <div
              className="rounded-lg px-3 py-2 text-xs text-center"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              Vastauksien paljastamisen jälkeen tästä kennosta ei enää kerry tilastoja.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancelConfirm}
                className="w-1/2 py-3 rounded-lg font-medium text-base cursor-pointer border"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Takaisin
              </button>
              <button
                type="button"
                onClick={onConfirmReveal}
                className="w-1/2 py-3 rounded-lg font-medium text-base cursor-pointer border-none"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-on-accent)',
                }}
              >
                Paljasta vastaukset
              </button>
            </div>
          </>
        ) : (
          <>
            {isRevealed && (
              <div
                className="rounded-lg px-3 py-2 text-xs text-center"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Vastaukset on jo paljastettu. Tästä kennosta ei enää kerry tilastoja.
              </div>
            )}

            <button
              type="button"
              onClick={onPlay}
              className="w-full py-3 rounded-lg font-medium text-base cursor-pointer border-none"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-on-accent)',
              }}
            >
              Pelaa
            </button>
            <button
              type="button"
              onClick={onReveal}
              className="w-full py-3 rounded-lg font-medium text-base cursor-pointer border-none"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
              }}
            >
              Näytä vastaukset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm bg-transparent border-none cursor-pointer"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Peruuta
            </button>
          </>
        )}
      </div>
    </div>
  );
}
