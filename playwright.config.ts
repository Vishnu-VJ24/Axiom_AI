import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Axiom.
 *
 * Default: runs locally against Chrome.
 * BrowserStack: set USE_BROWSERSTACK=true + BROWSERSTACK_USERNAME + BROWSERSTACK_ACCESS_KEY
 * to route execution through BrowserStack Automate.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

const USE_BROWSERSTACK = process.env.USE_BROWSERSTACK === 'true';

// BrowserStack Automate CDP endpoint
const browserstackWsEndpoint = USE_BROWSERSTACK
  ? `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify({
      browser: 'chrome',
      browser_version: 'latest',
      os: 'Windows',
      os_version: '11',
      name: 'Axiom E2E',
      build: `axiom-ci-${Date.now()}`,
      'browserstack.username': process.env.BROWSERSTACK_USERNAME,
      'browserstack.accessKey': process.env.BROWSERSTACK_ACCESS_KEY,
    }))}`
  : undefined;

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts', '**/*.spec.js'],

  /* Run tests in files in parallel */
  fullyParallel: !USE_BROWSERSTACK, // BrowserStack sessions run serially to avoid quota issues

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Reporter */
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    /* Base URL for all tests */
    baseURL: process.env.BASE_URL || 'http://localhost:5173',

    /* Collect trace when retrying failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* BrowserStack CDP endpoint (only when USE_BROWSERSTACK=true) */
    ...(USE_BROWSERSTACK ? { connectOptions: { wsEndpoint: browserstackWsEndpoint } } : {}),
  },

  /* Local projects (ignored when USE_BROWSERSTACK=true) */
  projects: USE_BROWSERSTACK
    ? [{ name: 'browserstack-chrome', use: {} }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ],

  /* Start backend + frontend dev servers before tests */
  webServer: [
    {
      command: 'npm run dev --workspace=backend',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'npm run dev --workspace=frontend',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
