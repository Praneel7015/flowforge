import { defineConfig } from '@playwright/test';

// Starts the API and the Vite dev server for the run (reuses ones already
// running locally), so `npm run test:e2e` works the same locally and in CI.
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'node server.js',
      cwd: '../backend',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: { PORT: '3001', NODE_ENV: 'test' },
    },
    {
      command: 'node node_modules/vite/bin/vite.js',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
