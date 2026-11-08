import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowLeftIcon, CloseIcon } from '../gameplay/icons.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Trap keyboard focus inside an active dialog and restore focus on close.
 * Moves initial focus to the dialog container so opening a modal does not
 * draw an automatic focus ring around the close button.
 */
export function useDialogFocusTrap(
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  onEscape?: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      dialog.focus({ preventScroll: true });
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        (onEscape ?? onClose)();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = focusableChildren(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !e.shiftKey &&
        (active === last || active === dialog || !dialog.contains(active))
      ) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKey);
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, enabled, onClose, onEscape]);
}

export interface ModalShellProps {
  show?: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  onBack?: () => void;
  backLabel?: string;
  onEscape?: () => void;
  headerMeta?: ReactNode;
  subHeader?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  trapFocus?: boolean;
}

/**
 * Render a consistent centered modal with an edge-to-edge structured header bar,
 * optional inline header metadata and pinned sub-header slots, and a scrollable body.
 */
export function ModalShell({
  show = true,
  title,
  titleId,
  onClose,
  onBack,
  backLabel = 'Takaisin arkistoon',
  onEscape,
  headerMeta,
  subHeader,
  children,
  className = '',
  bodyClassName = '',
  style,
  trapFocus = true,
}: ModalShellProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(dialogRef, onClose, onEscape, trapFocus && show);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgb(0 0 0 / 0.6)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`w-full max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[88vh] shadow-xl outline-none ${className}`}
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          ...style,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-modal-header
          className="px-4 py-2.5 border-b flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {onBack && (
              <button
                type="button"
                aria-label={backLabel}
                onClick={onBack}
                className="-ml-1.5 h-7 w-7 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--color-bg-primary)] active:scale-95 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                style={{ color: 'var(--color-accent)' }}
              >
                <ArrowLeftIcon size={18} />
              </button>
            )}
            <h2
              id={titleId}
              className="text-base font-semibold leading-tight truncate m-0"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerMeta}
            <button
              type="button"
              aria-label="Sulje"
              onClick={onClose}
              className="-mr-1 h-7 w-7 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center shrink-0 transition-colors hover:bg-[var(--color-bg-primary)] active:scale-95 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <CloseIcon size={18} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        {subHeader && (
          <div data-modal-subheader className="shrink-0">
            {subHeader}
          </div>
        )}

        <div
          data-modal-body
          className={`flex-1 min-h-0 overflow-y-auto px-4 ${subHeader ? 'pt-1 pb-3.5' : 'py-3.5'} ${bodyClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
