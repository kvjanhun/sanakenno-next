import { describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_SESSION_KEY,
  installChunkLoadErrorHandler,
  pwaOptions,
} from '../../packages/web/src/pwa.config.js';

function runtimeRuleFor(sampleUrl: string) {
  return pwaOptions.workbox?.runtimeCaching?.find((rule) => {
    if (rule.urlPattern instanceof RegExp) {
      return rule.urlPattern.test(sampleUrl);
    }
    if (typeof rule.urlPattern === 'function') {
      const url = new URL(sampleUrl, 'https://sanakenno.fi');
      const matcher = rule.urlPattern as (ctx: {
        url: URL;
        request: Request;
        sameOrigin: boolean;
      }) => boolean;
      return Boolean(
        matcher({
          url,
          request: new Request(url),
          sameOrigin: true,
        }),
      );
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

  it('disables devOptions service worker and scopes /api/ rule via URL pathname matcher', () => {
    expect(pwaOptions.devOptions?.enabled).toBe(false);
    const apiRule = runtimeRuleFor('/api/puzzle');
    expect(typeof apiRule?.urlPattern).toBe('function');
    expect(runtimeRuleFor('https://other-origin.example/assets/app.js')?.handler).not.toBe(
      'NetworkOnly',
    );
  });

  it('recovers from vite:preloadError with a 15s cooldown reload when online and skips reload when sessionStorage throws', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'));
    window.sessionStorage.clear();
    const listeners = new Map<string, EventListener>();
    const reloadSpy = vi.fn();
    const fakeWin = {
      addEventListener: ((type: string, cb: EventListener) => {
        listeners.set(type, cb);
      }) as Window['addEventListener'],
      sessionStorage: window.sessionStorage,
      navigator: { onLine: true } as Navigator,
      location: { reload: reloadSpy },
    };

    installChunkLoadErrorHandler(fakeWin);
    const handler = listeners.get('vite:preloadError');
    expect(handler).toBeDefined();

    const firstEvent = new Event('vite:preloadError', { cancelable: true });
    handler!(firstEvent);
    expect(firstEvent.defaultPrevented).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    const storedTs = Number(window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY));
    expect(Number.isFinite(storedTs)).toBe(true);
    expect(storedTs).toBe(Date.now());

    // Immediate second firing within 15s cooldown does not reload
    vi.advanceTimersByTime(5_000);
    const secondEvent = new Event('vite:preloadError', { cancelable: true });
    handler!(secondEvent);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // After 15s cooldown window, another deploy chunk error triggers a reload
    vi.advanceTimersByTime(11_000);
    const thirdEvent = new Event('vite:preloadError', { cancelable: true });
    handler!(thirdEvent);
    expect(reloadSpy).toHaveBeenCalledTimes(2);

    // If sessionStorage throws, do not reload (prevents infinite reload loops)
    const throwingWin = {
      addEventListener: ((type: string, cb: EventListener) => {
        listeners.set(type, cb);
      }) as Window['addEventListener'],
      sessionStorage: {
        getItem: () => {
          throw new Error('QuotaExceededError');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      } as unknown as Storage,
      navigator: { onLine: true } as Navigator,
      location: { reload: reloadSpy },
    };
    installChunkLoadErrorHandler(throwingWin);
    const throwingHandler = listeners.get('vite:preloadError');
    throwingHandler!(new Event('vite:preloadError', { cancelable: true }));
    expect(reloadSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
