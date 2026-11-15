export interface MessageBarProps {
  message: string;
  type: 'ok' | 'error';
}

type ChipStyle = { background: string; color: string };

const CHIP: Record<'ok' | 'error', ChipStyle> = {
  ok: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
  },
  error: {
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg-primary)',
  },
};

/** Immediate word-submission feedback bar rendered below WordInput. */
export function MessageBar({ message, type }: MessageBarProps): React.JSX.Element {
  const s = CHIP[type];
  const hasBg = type !== 'ok';
  return (
    <div
      className="flex justify-center items-center gap-2 text-sm font-medium min-h-[1.5rem] transition-opacity duration-300"
      style={{ opacity: message ? 1 : 0 }}
      role="status"
      aria-live="polite"
      data-testid="message-bar"
    >
      {message ? (
        <span
          style={{
            background: s.background,
            color: s.color,
            ...(hasBg ? { padding: '0.1rem 0.6rem', borderRadius: '999px' } : {}),
          }}
        >
          {message}
        </span>
      ) : (
        '\u00A0'
      )}
    </div>
  );
}
