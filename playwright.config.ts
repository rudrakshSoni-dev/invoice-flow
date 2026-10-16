import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 5174;

/**
 * Runs the real web app against the real API, with the LLM replaced by FixtureLlmProvider
 * (apps/api/test/fixture-llm.ts) so the happy path is deterministic and needs no API key.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter api serve:fixtures',
      url: `http://localhost:${API_PORT}/health`,
      env: { E2E_PORT: String(API_PORT), E2E_WEB_URL: `http://localhost:${WEB_PORT}` },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
});
