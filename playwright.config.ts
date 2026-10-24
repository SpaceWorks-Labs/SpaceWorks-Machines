import { defineConfig, devices } from "@playwright/test";

const testPort = Number(process.env.PLAYWRIGHT_PORT || 3000);
const testBaseUrl = `http://127.0.0.1:${testPort}`;
const defaultServerCommand = process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1"
  ? `PORT=${testPort} node .next/standalone/server.js`
  : `PORT=${testPort} npm run dev`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Signed-in journeys share the seeded demo spaces, so files run one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The development server compiles each route on first visit, which is slow on CI runners.
  timeout: process.env.CI ? 120_000 : 60_000,
  // Server Actions hash passwords (bcrypt, 12 rounds); give a busy machine room before failing an assertion.
  expect: { timeout: 20_000 },
  use: {
    // Use IPv4 explicitly: on this workstation localhost/::1 is served by a
    // separate development app while Space Works Machines is bound on 127.0.0.1.
    baseURL: testBaseUrl,
    trace: "on-first-retry",
    // Optional: an already-installed Chromium instead of Playwright's own download.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND || defaultServerCommand,
    // The test server trusts x-real-ip, so each browser context signs in from its own address
    // (tests/e2e/clientAddress.ts) and the suite stays under the per-address sign-in limit.
    ...(process.env.PLAYWRIGHT_SERVER_COMMAND ? {} : { env: { ...process.env as Record<string, string>, TRUSTED_PROXY_IP_HEADER: process.env.TRUSTED_PROXY_IP_HEADER || "x-real-ip" } }),
    url: `${testBaseUrl}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
