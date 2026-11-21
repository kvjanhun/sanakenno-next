import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Shared Vite PWA options used by the build and tests. */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  devOptions: {
    enabled: false,
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /\.(?:js|css|woff2?)$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-assets',
        },
      },
      {
        urlPattern: /\.(?:png|svg|ico)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
  manifest: {
    name: 'Sanakenno',
    short_name: 'Sanakenno',
    description: 'Suomalainen sanapeli',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#3A3A3A',
    background_color: '#3A3A3A',
    lang: 'fi',
    categories: ['games'],
    icons: [
      {
        src: 'icons/sanakenno-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'icons/sanakenno-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'icons/sanakenno-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
};

export const CHUNK_RELOAD_SESSION_KEY = 'sanakenno_chunk_reload_v1';
export const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

/**
 * Recover gracefully from stale dynamic import chunks after a PWA/Service Worker update
 * by performing a reload when online if no reload occurred within the last 15 seconds.
 * If sessionStorage is unavailable or throws, skip reloading to avoid an infinite loop.
 */
export function installChunkLoadErrorHandler(
  win: Pick<Window, 'addEventListener' | 'sessionStorage' | 'navigator'> & {
    location: Pick<Location, 'reload'>;
  } = window,
): void {
  win.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (win.navigator.onLine === false) return;
    try {
      const now = Date.now();
      const raw = win.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY);
      if (raw !== null) {
        const lastReloadAt = Number(raw);
        if (
          raw === '1' ||
          (Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS)
        ) {
          return;
        }
      }
      win.sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(now));
    } catch {
      return;
    }
    win.location.reload();
  });
}
