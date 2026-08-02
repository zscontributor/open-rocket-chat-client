import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the whole stack — web app, gateway and a real
 * Rocket.Chat — because the parts this project exists to get right (cookies,
 * WebSocket upgrades, proxied media) only exist where they meet.
 *
 * Start the dependencies first:
 *   (gateway repo)  pnpm run rc:up && pnpm --filter @open-rocket-chat/gateway dev
 *   (this repo)     pnpm --filter @open-rocket-chat/web dev
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
