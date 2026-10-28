import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { CloseIcon } from '../gameplay/icons.js';

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
      const target = focusableChildren(dialog)[0] ?? dialog;
      target.focus({ preventScroll: true });
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

      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
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
  onEscape?: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  headerClassName?: string;
  trapFocus?: boolean;
}

/**
 * Render a consistent centered modal with shared close affordance.
 */
export function ModalShell({
  show = true,
  title,
  titleId,
  onClose,
  onEscape,
  children,
  className = '',
  style,
  headerClassName = 'mb-1',
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
        className={`w-full max-w-sm rounded-xl p-4 overflow-y-auto max-h-[90vh] ${className}`}
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
        <div className={`flex items-center justify-between ${headerClassName}`}>
          <h2
            id={titleId}
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Sulje"
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-transparent border-none cursor-pointer flex items-center justify-center"
            style={{ color: 'var(--color-accent)' }}
          >
            <CloseIcon size={20} strokeWidth={2.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
