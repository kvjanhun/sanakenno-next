import path from 'node:path';
import { defineConfig } from 'vitest/config';

const webNodeModules = path.resolve(import.meta.dirname, 'packages/web/node_modules');

export default defineConfig({
  resolve: {
    alias: {
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
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
