/**
 * Open-source and open-data attribution records used across Sanakenno.
 */

export interface OpenLicenseEntry {
  name: string;
  license: string;
  copyright: string;
  url: string;
  type?: 'data' | 'library' | 'tool';
}

export const OPEN_LICENSES: readonly OpenLicenseEntry[] = [
  {
    name: 'Kotus (Nykysuomen sanalista)',
    license: 'CC BY 4.0',
    copyright: 'Kotimaisten kielten keskus',
    url: 'https://kotus.fi/sanakirjat/kielitoimiston-sanakirja/nykysuomen-sana-aineistot/nykysuomen-sanalista',
    type: 'data',
  },
  {
    name: 'React',
    license: 'MIT',
    copyright: 'Meta Platforms, Inc.',
    url: 'https://react.dev',
    type: 'library',
  },
  {
    name: 'React DOM',
    license: 'MIT',
    copyright: 'Meta Platforms, Inc.',
    url: 'https://react.dev',
    type: 'library',
  },
  {
    name: 'Vite',
    license: 'MIT',
    copyright: 'Evan You',
    url: 'https://vite.dev',
    type: 'tool',
  },
  {
    name: 'Tailwind CSS',
    license: 'MIT',
    copyright: 'Tailwind Labs, Inc.',
    url: 'https://tailwindcss.com',
    type: 'library',
  },
  {
    name: 'TanStack Query',
    license: 'MIT',
    copyright: 'Tanner Linsley',
    url: 'https://tanstack.com/query',
    type: 'library',
  },
  {
    name: 'Zustand',
    license: 'MIT',
    copyright: 'Paul Henschel',
    url: 'https://github.com/pmndrs/zustand',
    type: 'library',
  },
  {
    name: 'Hono',
    license: 'MIT',
    copyright: 'Yusuke Wada',
    url: 'https://hono.dev',
    type: 'library',
  },
  {
    name: 'Kysely',
    license: 'MIT',
    copyright: 'Sami Koskimäki',
    url: 'https://kysely.dev',
    type: 'library',
  },
  {
    name: 'better-sqlite3',
    license: 'MIT',
    copyright: 'Joshua Wise',
    url: 'https://github.com/WiseLibs/better-sqlite3',
    type: 'library',
  },
  {
    name: 'Zod',
    license: 'MIT',
    copyright: 'Colin McDonnell',
    url: 'https://zod.dev',
    type: 'library',
  },
  {
    name: 'Argon2',
    license: 'MIT',
    copyright: 'Ranisalt',
    url: 'https://github.com/ranisalt/node-argon2',
    type: 'library',
  },
  {
    name: 'Lucide Icons',
    license: 'ISC',
    copyright: 'Lucide Contributors',
    url: 'https://lucide.dev',
    type: 'library',
  },
  {
    name: 'Litestream',
    license: 'Apache-2.0',
    copyright: 'Ben Johnson',
    url: 'https://litestream.io',
    type: 'tool',
  },
  {
    name: 'Workbox',
    license: 'MIT',
    copyright: 'Google LLC',
    url: 'https://developer.chrome.com/docs/workbox',
    type: 'library',
  },
];
