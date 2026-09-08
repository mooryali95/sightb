import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * End-to-end coverage for the three paths that lose money when they break:
 * recording an expense, settling a custody, and exporting a report.
 *
 * The Supabase HTTP layer is stubbed at the network boundary (see
 * e2e/support/stub.ts) rather than pointed at a real project. That is a
 * deliberate limit, not an oversight: CI holds no database credentials, and a
 * suite that silently skips is the failure mode this repository has already
 * been burned by twice. Stubbing keeps these specs runnable everywhere and
 * honest about what they cover — routing, forms, state, the financial
 * arithmetic on the way to the wire, and the bytes of an exported workbook.
 * What the database itself enforces is covered by the pgTAP suites instead.
 *
 * Chromium resolution: this sandbox ships a browser that predates the one
 * Playwright pins, so PLAYWRIGHT_CHROMIUM_EXECUTABLE points at it when set.
 * CI installs its own and leaves the variable unset.
 */
const explicitChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const executablePath =
  explicitChromium && existsSync(explicitChromium) ? explicitChromium : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    locale: 'ar',
    launchOptions: executablePath ? { executablePath } : {},
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Preview the production build: these paths must hold in the bundle that
    // ships, not only under the dev server's looser module graph.
    command: 'bun run build && bunx vite preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: 'https://e2e.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key',
    },
  },
});
