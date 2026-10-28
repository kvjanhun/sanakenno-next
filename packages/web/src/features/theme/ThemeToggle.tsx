import { useCallback } from 'react';
import type { ThemePreference } from '@sanakenno/shared';
import { MoonIcon, SunIcon } from '../gameplay/icons.js';
import { resolveScheme, useThemePreferenceStore } from './useThemePreferenceStore.js';

export interface ThemeToggleProps {
  preference?: ThemePreference;
  setPreference?: (pref: ThemePreference) => void;
}

/**
 * Render a small icon button that toggles dark/light mode.
 */
export function ThemeToggle({
  preference: propPreference,
  setPreference: propSetPreference,
}: ThemeToggleProps = {}): React.JSX.Element {
  const storePreference = useThemePreferenceStore((s) => s.preference);
  const storeSetPreference = useThemePreferenceStore((s) => s.setPreference);

  const preference = propPreference !== undefined ? propPreference : storePreference;
  const setPreference = propSetPreference !== undefined ? propSetPreference : storeSetPreference;
  const resolved = resolveScheme(preference);

  const toggle = useCallback(() => {
    setPreference(resolved === 'light' ? 'dark' : 'light');
  }, [resolved, setPreference]);

  return (
    <button
      type="button"
      onClick={toggle}
      className="bg-transparent border-none cursor-pointer py-2 pl-1 leading-none flex items-center"
      style={{ color: 'var(--color-text-primary)' }}
      aria-label={resolved === 'dark' ? 'Vaihda vaaleaan teemaan' : 'Vaihda tummaan teemaan'}
    >
      {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
