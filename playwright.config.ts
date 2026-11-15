import { defineConfig } from '@playwright/test';

// Uses the locally installed Chrome when present (WebGL works there), else Playwright's Chromium.
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1440, height: 900 },
    launchOptions: existsSync(CHROME) ? { executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {},
    acceptDownloads: true,
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
