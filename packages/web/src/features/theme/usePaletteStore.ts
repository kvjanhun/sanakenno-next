import { create } from 'zustand';
import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from '@sanakenno/shared';
import { getRawStorage, loadFromStorage, saveToStorage } from '../gameplay/storage.js';

export const PALETTE_STORAGE_KEY = 'sanakenno_palette';
export const THEME_ID_STORAGE_KEY = 'sanakenno_theme_id';

export const PALETTE_LABELS: Record<ThemeId, string> = {
  hehku: 'Hehku',
  meri: 'Meri',
  metsa: 'Metsä',
  yo: 'Yö',
  aamu: 'Aamu',
  mono: 'Hiili',
};

/** Accent swatch colour for a palette in the resolved scheme. */
export function paletteAccent(id: ThemeId, scheme: 'light' | 'dark'): string {
  const map: Record<ThemeId, { light: string; dark: string }> = {
    hehku: { light: '#ff643e', dark: '#e05030' },
    meri: { light: '#0d9488', dark: '#2dd4bf' },
    metsa: { light: '#15803d', dark: '#22c55e' },
    yo: { light: '#6366f1', dark: '#818cf8' },
    aamu: { light: '#d97706', dark: '#f59e0b' },
    mono: { light: '#111827', dark: '#f3f4f6' },
  };
  return map[id][scheme];
}

export interface PaletteState {
  themeId: ThemeId;
  /** Set without pushing to the server — used when applying a server value. */
  setLocal: (id: ThemeId) => void;
  /** Set locally and persist to localStorage + DOM attribute. */
  setThemeId: (id: ThemeId) => void;
  /** Re-read from localStorage and sync DOM attribute. */
  hydrate: () => void;
}

function isValidThemeId(val: unknown): val is ThemeId {
  return typeof val === 'string' && (THEME_IDS as readonly string[]).includes(val);
}

function readStoredPalette(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const candidates = [
    loadFromStorage<string>(THEME_ID_STORAGE_KEY),
    loadFromStorage<string>(PALETTE_STORAGE_KEY),
    getRawStorage(THEME_ID_STORAGE_KEY),
    getRawStorage(PALETTE_STORAGE_KEY),
  ];
  for (const candidate of candidates) {
    if (isValidThemeId(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_THEME_ID;
}

function persistPalette(id: ThemeId): void {
  if (typeof window === 'undefined') return;
  saveToStorage(PALETTE_STORAGE_KEY, id);
  saveToStorage(THEME_ID_STORAGE_KEY, id);
}

function applyPaletteToRoot(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-palette', id);
}

let onPreferenceChangedCallback: (() => void) | null = null;

/** Register an optional callback invoked when local palette/theme preferences change. */
export function registerPreferenceSyncCallback(cb: (() => void) | null): void {
  onPreferenceChangedCallback = cb;
}

export function notifyPreferenceChanged(): void {
  onPreferenceChangedCallback?.();
}

const initialId = readStoredPalette();
applyPaletteToRoot(initialId);

export const usePaletteStore = create<PaletteState>()((set) => ({
  themeId: initialId,

  setLocal: (id: ThemeId) => {
    const next = isValidThemeId(id) ? id : DEFAULT_THEME_ID;
    persistPalette(next);
    applyPaletteToRoot(next);
    set({ themeId: next });
  },

  setThemeId: (id: ThemeId) => {
    const next = isValidThemeId(id) ? id : DEFAULT_THEME_ID;
    persistPalette(next);
    applyPaletteToRoot(next);
    set({ themeId: next });
    notifyPreferenceChanged();
  },

  hydrate: () => {
    const resolved = readStoredPalette();
    applyPaletteToRoot(resolved);
    set({ themeId: resolved });
  },
}));
