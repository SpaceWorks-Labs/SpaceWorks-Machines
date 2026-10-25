// README screenshots from the seeded demo, light and dark, into docs/screenshots/ (PNG, 1440×900):
//
//   DEMO_PASSWORD=… DEMO_MFA_SECRET=… npm run readme:screens -- http://127.0.0.1:3030
//
// Run against a production server on the demo database (npm run db:seed-demo first). Operator tool only.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import * as OTPAuth from "otpauth";

const base = (process.argv[2] ?? "http://127.0.0.1:3030").replace(/\/$/, "");
const out = path.resolve(import.meta.dirname, "../docs/screenshots");
const password = process.env.DEMO_PASSWORD, secret = process.env.DEMO_MFA_SECRET;
if (!password || !secret) throw new Error("Set DEMO_PASSWORD and DEMO_MFA_SECRET (the values used to seed the demo).");

/** [file name, path, needs sign-in] */
const SCREENS = [
  ["public-machines", "/s/tinkerspace/machines", false],
  ["public-machine", "/s/tinkerspace/machines/prusa-mk4", false],
  ["machines", "/dashboard/tinkerspace/machines", true],
  ["jobs", "/dashboard/tinkerspace/jobs", true],
  ["maintenance", "/dashboard/tinkerspace/maintenance", true],
  ["upkeep", "/dashboard/tinkerspace/machines/prusa-mk4/upkeep", true],
  ["consumables", "/dashboard/tinkerspace/consumables", true],
  ["reports", "/dashboard/tinkerspace/reports", true],
  ["integrations", "/dashboard/tinkerspace/integrations", true],
  ["repair", "/dashboard/tinkerspace/maintenance/faults/1", true],
  ["finance", "/dashboard/tinkerspace/finance", true],
];

async function signIn(page) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="email"]').fill("manager@demo.test");
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = page.getByLabel("Authenticator or recovery code");
  await code.waitFor({ timeout: 30_000 });
  await code.fill(new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate());
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  // One session for both modes: each authenticator step works once, so sign in a single time.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  const shot = (name, mode) => page.screenshot({ path: path.join(out, `${name}${mode === "dark" ? "-dark" : ""}.png`) });
  for (const mode of ["light", "dark"]) {
    await context.addCookies([{ name: "swm.theme", value: mode, url: base }]);
    for (const [name, route] of SCREENS.filter(([, , auth]) => !auth)) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      await shot(name, mode);
    }
  }
  await signIn(page);
  for (const mode of ["light", "dark"]) {
    await context.addCookies([{ name: "swm.theme", value: mode, url: base }]);
    for (const [name, route] of SCREENS.filter(([, , auth]) => auth)) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      await shot(name, mode);
      console.log(`captured ${name} (${mode})`);
    }
    // The finished-job page, with the layer-ticker easter egg.
    await page.goto(`${base}/dashboard/tinkerspace/jobs`, { waitUntil: "networkidle" });
    await Promise.all([page.waitForURL(/\/jobs\/\d+$/), page.getByRole("link", { name: /Name plate/ }).first().click()]);
    await page.waitForLoadState("networkidle");
    await shot("job", mode);
  }
  await context.close();
} finally {
  await browser.close();
}
