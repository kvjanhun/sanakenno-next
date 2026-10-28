import {
  DEFAULT_THEME_ID,
  getHoneycombCenterOverlayStops,
  getHoneycombCenterOverlayVariant,
  type ThemeId,
} from '@sanakenno/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type PointerEvent,
} from 'react';
import { CheckIcon, DeleteIcon, ShareIcon, ShuffleIcon, type IconProps } from './icons.js';

function buildOverlayGradient(themeId: ThemeId, scheme: 'light' | 'dark'): string {
  const stops = getHoneycombCenterOverlayStops(getHoneycombCenterOverlayVariant(themeId, scheme));
  return `linear-gradient(180deg, ${stops
    .map(
      (stop) =>
        `color-mix(in srgb, ${stop.color} ${Math.round(stop.opacity * 100)}%, transparent) ${stop.offset}`,
    )
    .join(', ')})`;
}

type ControlVariant = 'neutral' | 'accent';

function ControlButton({
  label,
  variant,
  onAction,
  accentGloss,
  Icon,
  className = '',
}: {
  label: string;
  variant: ControlVariant;
  onAction: () => void;
  accentGloss: string;
  Icon: ComponentType<IconProps>;
  className?: string;
}): React.JSX.Element {
  const isAccent = variant === 'accent';
  const handledByPointerRef = useRef(false);

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    handledByPointerRef.current = true;
    onAction();
  };

  const handleClick = (): void => {
    if (handledByPointerRef.current) {
      handledByPointerRef.current = false;
      return;
    }
    onAction();
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      aria-label={label}
      className={`relative min-w-0 overflow-hidden rounded-xl text-sm font-medium cursor-pointer transition-transform duration-100 active:translate-y-px active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 flex items-center justify-center ${className}`}
      style={{
        backgroundColor: 'transparent',
        color: isAccent ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
        border: `1px solid ${isAccent ? 'var(--color-accent-faded)' : 'var(--color-hex-stroke)'}`,
        boxShadow:
          '0 2px 5px -4px var(--color-button-shadow), 0 10px 20px -16px var(--color-button-shadow)',
        outlineColor: 'var(--color-accent)',
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: isAccent
            ? 'var(--color-accent)'
            : 'linear-gradient(180deg, var(--color-hex-hi) 0%, var(--color-hex-lo) 100%)',
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: isAccent
            ? accentGloss
            : 'linear-gradient(180deg, rgb(255 255 255 / 0.12) 0%, rgb(255 255 255 / 0.03) 40%, transparent 70%)',
          opacity: isAccent ? 0.7 : 1,
        }}
      />
      <span className="pointer-events-none relative z-10 flex items-center justify-center">
        <Icon size={18} strokeWidth={2.4} />
      </span>
    </button>
  );
}

export interface GameControlsProps {
  onDelete: () => void;
  onShuffle: () => void;
  onShare: () => void;
  shareCopied: boolean;
  onSubmit: () => void;
  themeId?: ThemeId;
  scheme?: 'light' | 'dark';
}

export function GameControls({
  onDelete,
  onShuffle,
  onShare,
  shareCopied,
  onSubmit,
  themeId = DEFAULT_THEME_ID,
  scheme = 'light',
}: GameControlsProps): React.JSX.Element {
  const accentGloss = useMemo(() => buildOverlayGradient(themeId, scheme), [themeId, scheme]);
  const ref = useRef<HTMLDivElement>(null);
  const preventTouch = useCallback((e: TouchEvent) => e.preventDefault(), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('touchstart', preventTouch, { passive: false });
    return () => el.removeEventListener('touchstart', preventTouch);
  }, [preventTouch]);

  return (
    <div
      ref={ref}
      className="flex items-center justify-center gap-3"
      style={{ touchAction: 'none' }}
    >
      <ControlButton
        label="Poista"
        variant="neutral"
        Icon={DeleteIcon}
        className="w-20 h-11"
        accentGloss={accentGloss}
        onAction={onDelete}
      />
      <ControlButton
        label="Sekoita"
        variant="neutral"
        Icon={ShuffleIcon}
        className="w-12 h-11"
        accentGloss={accentGloss}
        onAction={onShuffle}
      />
      <div style={{ position: 'relative' }}>
        <ControlButton
          label="Jaa"
          variant="neutral"
          Icon={ShareIcon}
          className="w-12 h-11"
          accentGloss={accentGloss}
          onAction={onShare}
        />
        {shareCopied && (
          <div
            className="text-xs"
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: '0.5rem',
              zIndex: 20,
              background: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              padding: '0.2rem 0.6rem',
              color: 'var(--color-text-secondary)',
              boxShadow: '0 2px 8px rgb(0 0 0 / 0.15)',
              whiteSpace: 'nowrap',
            }}
          >
            Kopioitu!
          </div>
        )}
      </div>
      <ControlButton
        label="OK"
        variant="accent"
        Icon={CheckIcon}
        className="w-20 h-11"
        accentGloss={accentGloss}
        onAction={onSubmit}
      />
    </div>
  );
}
