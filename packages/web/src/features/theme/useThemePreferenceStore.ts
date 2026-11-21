import { create } from 'zustand';
import type { ThemePreference } from '@sanakenno/shared';
import { getRawStorage, loadFromStorage, saveToStorage } from '../gameplay/storage.js';
import { notifyPreferenceChanged, PREFERENCES_UPDATED_AT_KEY } from './usePaletteStore.js';

export const THEME_STORAGE_KEY = 'sanakenno_theme';
export const THEME_PREFERENCE_STORAGE_KEY = 'sanakenno_theme_preference';

export interface ThemePreferenceState {
  preference: ThemePreference;
  resolvedScheme: 'light' | 'dark';
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

let attachedMql: MediaQueryList | null = null;
let attachedListener: ((e: MediaQueryListEvent) => void) | null = null;

function ensureSystemSchemeListener(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (!mql || mql === attachedMql) return;

  if (attachedMql && attachedListener) {
    attachedMql.removeEventListener?.('change', attachedListener);
  }

  const listener = () => {
    const pref = useThemePreferenceStore.getState().preference;
    useThemePreferenceStore.setState({ resolvedScheme: resolveScheme(pref) });
  };
  mql.addEventListener?.('change', listener);
  attachedMql = mql;
  attachedListener = listener;
}

const initial = readStoredPreference();
applyThemeToRoot(initial);

export const useThemePreferenceStore = create<ThemePreferenceState>()((set) => ({
  preference: initial,
  resolvedScheme: resolveScheme(initial),

  setLocal: (pref: ThemePreference) => {
    const next = isValidThemePreference(pref) ? pref : 'system';
    persistPreference(next);
    applyThemeToRoot(next);
    ensureSystemSchemeListener();
    set({ preference: next, resolvedScheme: resolveScheme(next) });
  },

  setPreference: (pref: ThemePreference) => {
    const next = isValidThemePreference(pref) ? pref : 'system';
    persistPreference(next);
    if (typeof window !== 'undefined') {
      saveToStorage(PREFERENCES_UPDATED_AT_KEY, new Date().toISOString());
    }
    applyThemeToRoot(next);
    ensureSystemSchemeListener();
    set({ preference: next, resolvedScheme: resolveScheme(next) });
    notifyPreferenceChanged();
  },

  hydrate: () => {
    const resolved = readStoredPreference();
    applyThemeToRoot(resolved);
    ensureSystemSchemeListener();
    set({ preference: resolved, resolvedScheme: resolveScheme(resolved) });
  },
}));

ensureSystemSchemeListener();
