import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/pwa.config';

const apiPort = process.env.API_PORT ?? '3001';
const port = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
  server: {
    port,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
