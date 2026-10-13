import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

// CI installs the Chromium that matches this Playwright version. A machine whose browsers were
// installed for another version sets PW_CHROMIUM_PATH to a Chromium binary instead.
const executablePath = process.env['PW_CHROMIUM_PATH'];
const launchOptions = executablePath === undefined ? {} : { executablePath };

// End-to-end evidence (design: "End-to-end, accessibility and boundary tests"). The app is the
// production build served by `vp preview`, which applies the `vercel.json` headers, so the strict
// CSP is in force. YNAB is never contacted: each test routes https://api.ynab.com to the fake.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],
  webServer: {
    command: `pnpm exec vp preview --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 60_000,
  },
});
