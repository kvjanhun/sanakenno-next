import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export function useIsDesktop(): boolean {
  const getMatches = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  };
  const [isDesktop, setIsDesktop] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger';
export type AdminAlertVariant = 'error' | 'success' | 'warning';

export const ADMIN_CARD_CLASS = 'p-5 rounded-2xl border';
export const ADMIN_CARD_STYLE: CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary)',
  borderColor: 'var(--color-border)',
};

export const ADMIN_SUBCARD_CLASS = 'p-4 rounded-xl border';
export const ADMIN_SUBCARD_STYLE: CSSProperties = {
  backgroundColor: 'var(--color-bg-primary)',
  borderColor: 'var(--color-border)',
};

export const ADMIN_INPUT_CLASS =
  'px-3 py-1.5 rounded-lg border text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]';
export const ADMIN_NO_SPINNER_CLASS =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
export const ADMIN_INPUT_STYLE: CSSProperties = {
  backgroundColor: 'var(--color-bg-primary)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text-primary)',
};

export const ADMIN_TABLE_WRAPPER_CLASS = 'rounded-2xl border overflow-x-auto';
export const ADMIN_TABLE_HEAD_ROW_CLASS =
  'border-b text-[11px] font-semibold uppercase tracking-wide';
export const ADMIN_TABLE_HEAD_ROW_STYLE: CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'color-mix(in srgb, var(--color-bg-primary) 55%, var(--color-bg-secondary))',
  color: 'var(--color-text-secondary)',
};

export const ADMIN_TABLE_ROW_CLASS =
  'border-b last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]';

export function adminButtonClass(size: 'sm' | 'md' = 'md'): string {
  const padding = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-xs';
  return `${padding} rounded-lg font-semibold cursor-pointer border transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]`;
}

export function adminButtonStyle(
  variant: AdminButtonVariant = 'secondary',
  surface: 'primary' | 'secondary' = 'primary',
): CSSProperties {
  if (variant === 'primary') {
    return {
      backgroundColor: 'var(--color-accent)',
      borderColor: 'var(--color-accent)',
      color: 'var(--color-on-accent)',
    };
  }
  if (variant === 'danger') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, var(--color-bg-primary))',
      borderColor: 'color-mix(in srgb, var(--color-error) 35%, var(--color-border))',
      color: 'var(--color-error)',
    };
  }
  return {
    backgroundColor:
      surface === 'primary' ? 'var(--color-bg-primary)' : 'var(--color-bg-secondary)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
  };
}

export function AdminAlert({
  variant,
  role,
  children,
}: {
  variant: AdminAlertVariant;
  role?: string;
  children: ReactNode;
}): React.JSX.Element {
  const tone = variant === 'error' ? 'var(--color-error)' : 'var(--color-accent)';
  return (
    <div
      role={role}
      className="px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between"
      style={{
        backgroundColor: `color-mix(in srgb, ${tone} 10%, var(--color-bg-primary))`,
        borderColor: `color-mix(in srgb, ${tone} 35%, var(--color-border))`,
        color: tone,
      }}
    >
      <span>{children}</span>
    </div>
  );
}

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2
          className="text-lg font-bold tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string | number>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <div
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      className="inline-flex rounded-xl p-1 gap-0.5 border"
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderColor: 'var(--color-border)',
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all"
            style={{
              backgroundColor: selected ? 'var(--color-accent)' : 'transparent',
              color: selected ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function LetterTile({
  letter,
  isCenter = false,
  size = 'md',
}: {
  letter: string;
  isCenter?: boolean;
  size?: 'sm' | 'md';
}): React.JSX.Element {
  const dims = size === 'sm' ? 'w-6 h-6 text-[11px] rounded-md' : 'w-7 h-7 text-xs rounded-lg';
  return (
    <span
      className={`inline-flex items-center justify-center ${dims} font-bold uppercase border`}
      style={{
        fontFamily: 'var(--font-game)',
        backgroundColor: isCenter ? 'var(--color-accent)' : 'var(--color-bg-primary)',
        color: isCenter ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
        borderColor: isCenter ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      {letter}
    </span>
  );
}
