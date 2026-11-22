import path from 'node:path';
import { defineConfig } from 'vitest/config';

const webNodeModules = path.resolve(import.meta.dirname, 'packages/web/node_modules');
const serverNodeModules = path.resolve(import.meta.dirname, 'packages/server/node_modules');

export default defineConfig({
  resolve: {
    alias: {
      '@sanakenno/admin': path.resolve(import.meta.dirname, 'packages/admin/src/index.ts'),
      '@sanakenno/shared': path.resolve(import.meta.dirname, 'packages/shared/src/index.ts'),
      '@libsql/client': path.join(serverNodeModules, '@libsql/client'),
      'better-sqlite3': path.join(serverNodeModules, 'better-sqlite3'),
      kysely: path.join(serverNodeModules, 'kysely'),
      react: path.join(webNodeModules, 'react'),
      'react-dom': path.join(webNodeModules, 'react-dom'),
      '@tanstack/react-query': path.join(webNodeModules, '@tanstack/react-query'),
      zustand: path.join(webNodeModules, 'zustand'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/**/*.{test.ts,test.tsx}', 'packages/*/src/**/*.{test.ts,test.tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        'packages/server/src/db/baseline-sql.ts',
        'packages/server/src/db/seed.ts',
        'packages/web/src/main.tsx',
        'packages/server/src/index.ts',
      ],
    },
  },
});
