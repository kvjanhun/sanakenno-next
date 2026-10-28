import { useEffect, useRef, useState } from 'react';
import { THEME_IDS, type ThemeId, type ThemePreference } from '@sanakenno/shared';
import { CheckIcon, PaletteIcon } from '../gameplay/icons.js';
import { PALETTE_LABELS, paletteAccent, usePaletteStore } from './usePaletteStore.js';
import { resolveScheme, useThemePreferenceStore } from './useThemePreferenceStore.js';

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
  const storePreference = useThemePreferenceStore((s) => s.preference);

  const themeId = propThemeId !== undefined ? propThemeId : storeThemeId;
  const setThemeId = propSetThemeId !== undefined ? propSetThemeId : storeSetThemeId;
  const preference = propPreference !== undefined ? propPreference : storePreference;
  const scheme = resolveScheme(preference);

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
            {THEME_IDS.map((id) => {
              const selected = id === themeId;
              const isMonoDark = id === 'mono' && scheme === 'dark';
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  aria-label={PALETTE_LABELS[id]}
                  onClick={() => {
                    setThemeId(id);
                    setOpen(false);
                  }}
                  className="flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                >
                  <span
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: paletteAccent(id, scheme),
                      border: selected
                        ? '2px solid var(--color-text-primary)'
                        : '1px solid var(--color-border)',
                      boxSizing: 'border-box',
                    }}
                  >
                    {selected ? (
                      <CheckIcon
                        size={14}
                        strokeWidth={3}
                        style={{ color: isMonoDark ? 'black' : 'white' }}
                      />
                    ) : null}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-primary)',
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {PALETTE_LABELS[id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
