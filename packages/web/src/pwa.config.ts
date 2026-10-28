import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Shared Vite PWA options used by the build and tests. */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  devOptions: {
    enabled: true,
  },
  workbox: {
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        urlPattern: /^\/api\//,
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
