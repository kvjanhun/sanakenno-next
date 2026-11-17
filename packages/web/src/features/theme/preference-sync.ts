let onPreferenceChangedCallback: (() => void) | null = null;

/** Register an optional callback invoked when local palette/theme preferences change. */
export function registerPreferenceSyncCallback(cb: (() => void) | null): void {
  onPreferenceChangedCallback = cb;
}

/** Notify the registered sync listener that local palette/theme preferences changed. */
export function notifyPreferenceChanged(): void {
  onPreferenceChangedCallback?.();
}
