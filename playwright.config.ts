import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'PORT=3002 DB_PATH=:memory: SEED_ON_BOOT=true pnpm --filter @sanakenno/server start',
      url: 'http://localhost:3002/api/health',
      reuseExistingServer: false,
      timeout: 15000,
    },
    {
      command: 'API_PORT=3002 pnpm --filter @sanakenno/web dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 15000,
    },
  ],
});
