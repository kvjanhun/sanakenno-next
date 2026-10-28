import { create } from 'zustand';
import type { ThemePreference } from '@sanakenno/shared';
import { getRawStorage, loadFromStorage, saveToStorage } from '../gameplay/storage.js';
import { notifyPreferenceChanged } from './usePaletteStore.js';

export const THEME_STORAGE_KEY = 'sanakenno_theme';
export const THEME_PREFERENCE_STORAGE_KEY = 'sanakenno_theme_preference';

export interface ThemePreferenceState {
  preference: ThemePreference;
  /** Set without echoing to the server — used when applying a server value. */
  setLocal: (pref: ThemePreference) => void;
  /** Set locally and persist to localStorage + DOM attribute. */
  setPreference: (pref: ThemePreference) => void;
  /** Re-read from localStorage and sync DOM attribute. */
  hydrate: () => void;
}

function isValidThemePreference(val: unknown): val is ThemePreference {
  return val === 'light' || val === 'dark' || val === 'system';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const candidates = [
    loadFromStorage<string>(THEME_PREFERENCE_STORAGE_KEY),
    loadFromStorage<string>(THEME_STORAGE_KEY),
    getRawStorage(THEME_PREFERENCE_STORAGE_KEY),
    getRawStorage(THEME_STORAGE_KEY),
  ];
  for (const candidate of candidates) {
    if (isValidThemePreference(candidate)) {
      return candidate;
    }
  }
  return 'system';
}

function persistPreference(pref: ThemePreference): void {
  if (typeof window === 'undefined') return;
  saveToStorage(THEME_STORAGE_KEY, pref);
  saveToStorage(THEME_PREFERENCE_STORAGE_KEY, pref);
}

function applyThemeToRoot(pref: ThemePreference): void {
  if (typeof document === 'undefined') return;
  if (pref === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', pref);
  }
}

/** Resolve the current scheme to a concrete 'light' | 'dark' value. */
export function resolveScheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return pref;
}

const initial = readStoredPreference();
applyThemeToRoot(initial);

export const useThemePreferenceStore = create<ThemePreferenceState>()((set) => ({
  preference: initial,

  setLocal: (pref: ThemePreference) => {
    const next = isValidThemePreference(pref) ? pref : 'system';
    persistPreference(next);
    applyThemeToRoot(next);
    set({ preference: next });
  },

  setPreference: (pref: ThemePreference) => {
    const next = isValidThemePreference(pref) ? pref : 'system';
    persistPreference(next);
    applyThemeToRoot(next);
    set({ preference: next });
    notifyPreferenceChanged();
  },

  hydrate: () => {
    const resolved = readStoredPreference();
    applyThemeToRoot(resolved);
    set({ preference: resolved });
  },
}));
