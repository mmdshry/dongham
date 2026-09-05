import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'pnpm --filter @dongham/api dev',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
      timeout: 180_000,
      env: { ...process.env, OTP_PROVIDER: 'mock' },
    },
    {
      command: 'pnpm --filter @dongham/app dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @dongham/admin dev -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
      timeout: 180_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
