import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../packages/web/src/pwa.config.js';

function runtimeRuleFor(sampleUrl: string) {
  return pwaOptions.workbox?.runtimeCaching?.find((rule) => {
    if (rule.urlPattern instanceof RegExp) {
      return rule.urlPattern.test(sampleUrl);
    }
    return false;
  });
}

describe('PWA configuration', () => {
  it('declares an installable Finnish game manifest', () => {
    const manifest =
      pwaOptions.manifest && typeof pwaOptions.manifest === 'object' ? pwaOptions.manifest : null;
    expect(manifest).not.toBeNull();
    expect(manifest).toMatchObject({
      name: 'Sanakenno',
      short_name: 'Sanakenno',
      description: 'Suomalainen sanapeli',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      lang: 'fi',
      categories: ['games'],
    });

    const icons = manifest?.icons ?? [];
    expect(icons.map((icon: { sizes?: string }) => icon.sizes)).toContain('192x192');
    expect(icons.map((icon: { sizes?: string }) => icon.sizes)).toContain('512x512');
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: 'icons/sanakenno-maskable-512x512.png',
          purpose: 'maskable',
        }),
      ]),
    );
  });

  it('keeps API, static asset, and image runtime caching strategies distinct', () => {
    expect(runtimeRuleFor('/api/puzzle')).toMatchObject({
      handler: 'NetworkOnly',
    });
    expect(runtimeRuleFor('/assets/index-abc123.js')).toMatchObject({
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'static-assets' },
    });
    expect(runtimeRuleFor('/assets/index-abc123.css')).toMatchObject({
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'static-assets' },
    });
    expect(runtimeRuleFor('/icons/sanakenno-192x192.png')).toMatchObject({
      handler: 'CacheFirst',
      options: { cacheName: 'images' },
    });
  });

  it('denylists /api/ from navigation fallback', () => {
    const denylist = pwaOptions.workbox?.navigateFallbackDenylist;
    expect(denylist).toBeDefined();
    expect(Array.isArray(denylist)).toBe(true);
    const hasApiPattern = denylist?.some(
      (entry) => entry instanceof RegExp && entry.test('/api/puzzle'),
    );
    expect(hasApiPattern).toBe(true);
  });
});
