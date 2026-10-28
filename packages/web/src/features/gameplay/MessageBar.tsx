export interface MessageBarProps {
  message: string;
  type: 'ok' | 'error' | 'special';
  secondaryMessage?: string;
  secondaryType?: 'ok' | 'error' | 'special';
}

type ChipStyle = { background: string; color: string; border?: string };

const CHIP: Record<'ok' | 'error' | 'special', ChipStyle> = {
  ok: {
    background: 'transparent',
    color: 'var(--color-text-secondary)',
  },
  special: {
    background: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  error: {
    background: 'var(--color-text-primary)',
    color: 'var(--color-bg-primary)',
  },
};

function Chip({
  text,
  type,
}: {
  text: string;
  type: 'ok' | 'error' | 'special';
}): React.JSX.Element {
  const s = CHIP[type];
  const hasBg = type !== 'ok';
  return (
    <span
      style={{
        background: s.background,
        color: s.color,
        ...(hasBg ? { padding: '0.1rem 0.6rem', borderRadius: '999px' } : {}),
      }}
    >
      {text}
    </span>
  );
}

export function MessageBar({
  message,
  type,
  secondaryMessage,
  secondaryType = 'ok',
}: MessageBarProps): React.JSX.Element {
  const visible = !!(message || secondaryMessage);
  return (
    <div
      className="flex justify-center items-center gap-2 text-sm font-medium min-h-[1.5rem] transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      role="status"
      aria-live="polite"
      data-testid="message-bar"
    >
      {message ? <Chip text={message} type={type} /> : null}
      {secondaryMessage ? <Chip text={secondaryMessage} type={secondaryType} /> : null}
      {!visible && '\u00A0'}
    </div>
  );
}
