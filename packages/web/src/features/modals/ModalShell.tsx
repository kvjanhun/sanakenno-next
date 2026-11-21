import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeftIcon, CloseIcon } from '../gameplay/icons.js';

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
 * Render a consistent centered native `<dialog>` modal with an edge-to-edge structured header bar,
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pointerDownTargetRef = useRef<EventTarget | null>(null);
  const onCloseRef = useRef(onClose);
  const onEscapeRef = useRef(onEscape);
  onCloseRef.current = onClose;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!show) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) {
      dialog.showModal();
    }
    if (trapFocus) {
      dialog.focus({ preventScroll: true });
    }

    return () => {
      if (dialog.open) {
        dialog.close();
      }
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [show, trapFocus]);

  if (!show) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[88vh] shadow-xl outline-none backdrop:bg-black/60 p-0 ${className}`}
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
        ...style,
      }}
      onCancel={(e) => {
        e.preventDefault();
        (onEscapeRef.current ?? onCloseRef.current)();
      }}
      onPointerDown={(e) => {
        pointerDownTargetRef.current = e.target;
      }}
      onMouseDown={(e) => {
        pointerDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        const startedInside =
          pointerDownTargetRef.current !== null && pointerDownTargetRef.current !== e.currentTarget;
        pointerDownTargetRef.current = null;
        if (e.target === e.currentTarget && !startedInside) {
          onCloseRef.current();
        }
      }}
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
    </dialog>
  );
}
