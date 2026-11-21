import { useEffect, useRef, useState } from 'react';
import { THEME_IDS, type ThemeId, type ThemePreference } from '@sanakenno/shared';
import { CheckIcon, PaletteIcon } from '../gameplay/icons.js';
import { PALETTE_LABELS, paletteAccent, usePaletteStore } from './usePaletteStore.js';
import { resolveScheme, useThemePreferenceStore } from './useThemePreferenceStore.js';

export interface PaletteSwatchesProps {
  themeId: ThemeId;
  scheme: 'light' | 'dark';
  onSelect: (id: ThemeId) => void;
  itemRole?: 'radio' | 'menuitemradio';
  swatchSize?: number;
  labelFontSize?: number;
  compact?: boolean;
}

/** Shared 6-palette swatch selector used in both ThemeSelector popover and SettingsModal. */
export function PaletteSwatches({
  themeId,
  scheme,
  onSelect,
  itemRole = 'radio',
  swatchSize = 30,
  labelFontSize = 9.5,
  compact = false,
}: PaletteSwatchesProps): React.JSX.Element {
  return (
    <>
      {THEME_IDS.map((id: ThemeId) => {
        const selected = id === themeId;
        const isMonoDark = id === 'mono' && scheme === 'dark';
        return (
          <button
            key={id}
            type="button"
            role={itemRole}
            aria-checked={selected}
            aria-label={PALETTE_LABELS[id]}
            onClick={() => onSelect(id)}
            className={`flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-0 ${
              compact ? 'min-w-0 flex-1' : ''
            }`}
          >
            <span
              className="flex items-center justify-center rounded-full transition-transform active:scale-95"
              style={{
                width: swatchSize,
                height: swatchSize,
                backgroundColor: paletteAccent(id, scheme),
                border: selected
                  ? '2px solid var(--color-text-primary)'
                  : '1px solid var(--color-border)',
                boxSizing: 'border-box',
              }}
            >
              {selected && (
                <CheckIcon
                  size={14}
                  strokeWidth={3}
                  style={{ color: isMonoDark ? 'black' : 'white' }}
                />
              )}
            </span>
            <span
              className={compact ? 'truncate text-center w-full' : undefined}
              style={{
                fontSize: labelFontSize,
                color: 'var(--color-text-primary)',
                fontWeight: selected ? (compact ? 700 : 600) : 400,
              }}
            >
              {PALETTE_LABELS[id]}
            </span>
          </button>
        );
      })}
    </>
  );
}

export interface ThemeSelectorProps {
  themeId?: ThemeId;
  setThemeId?: (id: ThemeId) => void;
  preference?: ThemePreference;
}

/**
 * Render the color-palette selector button and popover.
 */
export function ThemeSelector({
  themeId: propThemeId,
  setThemeId: propSetThemeId,
  preference: propPreference,
}: ThemeSelectorProps = {}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const storeThemeId = usePaletteStore((s) => s.themeId);
  const storeSetThemeId = usePaletteStore((s) => s.setThemeId);
  const storeResolvedScheme = useThemePreferenceStore((s) => s.resolvedScheme);

  const themeId = propThemeId !== undefined ? propThemeId : storeThemeId;
  const setThemeId = propSetThemeId !== undefined ? propSetThemeId : storeSetThemeId;
  const scheme = propPreference !== undefined ? resolveScheme(propPreference) : storeResolvedScheme;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="py-2 px-1 rounded-lg bg-transparent border-none cursor-pointer flex items-center"
        style={{ color: 'var(--color-text-primary)' }}
        aria-label="Valitse väriteema"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <PaletteIcon size={20} strokeWidth={2.5} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Väriteema"
          className="absolute right-0 top-full mt-2 rounded-lg border p-3 shadow-lg"
          style={{
            zIndex: 80,
            backgroundColor: 'var(--color-bg-primary)',
            borderColor: 'var(--color-border)',
            boxShadow: '0 12px 30px var(--color-button-shadow)',
          }}
        >
          <div className="flex items-start gap-3">
            <PaletteSwatches
              themeId={themeId}
              scheme={scheme}
              itemRole="menuitemradio"
              swatchSize={32}
              labelFontSize={11}
              onSelect={(id) => {
                setThemeId(id);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
