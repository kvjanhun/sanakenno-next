import type { ThemeId } from './auth-types.js';

export type HoneycombCenterOverlayVariant = 'glossy' | 'shadowy';

export interface HoneycombCenterOverlayStop {
  offset: string;
  color: '#ffffff' | '#000000';
  opacity: number;
}

const GLOSSY_CENTER_OVERLAY_STOPS: readonly HoneycombCenterOverlayStop[] = [
  { offset: '0%', color: '#ffffff', opacity: 0.2 },
  { offset: '55%', color: '#ffffff', opacity: 0.06 },
  { offset: '100%', color: '#000000', opacity: 0.2 },
];

const SHADOWY_CENTER_OVERLAY_STOPS: readonly HoneycombCenterOverlayStop[] = [
  { offset: '0%', color: '#000000', opacity: 0.0 },
  { offset: '55%', color: '#000000', opacity: 0.08 },
  { offset: '100%', color: '#000000', opacity: 0.3 },
];

/**
 * Resolve the center-hex overlay style for a palette / scheme pair.
 * `shadowy` is used for bright accents that need depth without a white gloss.
 */
export function getHoneycombCenterOverlayVariant(
  themeId: ThemeId,
  scheme: 'light' | 'dark',
): HoneycombCenterOverlayVariant {
  if (themeId === 'mono' && scheme === 'dark') {
    return 'shadowy';
  }

  return 'glossy';
}

/** Return the SVG gradient stops for a center-hex overlay variant. */
export function getHoneycombCenterOverlayStops(
  variant: HoneycombCenterOverlayVariant,
): readonly HoneycombCenterOverlayStop[] {
  return variant === 'shadowy' ? SHADOWY_CENTER_OVERLAY_STOPS : GLOSSY_CENTER_OVERLAY_STOPS;
}
