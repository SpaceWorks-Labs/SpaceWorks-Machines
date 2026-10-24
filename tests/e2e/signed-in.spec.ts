import { expect, test, type Page } from "@playwright/test";
import { nextTotp } from "./totp";
import { clientAddressHeaders } from "./clientAddress";

// Role journeys over the demo data from `npm run db:seed-demo`. The demo password comes from DEMO_PASSWORD
// and the staff authenticator from DEMO_MFA_SECRET; without them these tests are skipped.
const password = process.env.DEMO_PASSWORD;
const mfaSecret = process.env.DEMO_MFA_SECRET;
test.skip(!password || !mfaSecret, "DEMO_PASSWORD and DEMO_MFA_SECRET must be set; seed the demo data to run signed-in journeys.");

async function signIn(page: Page, email: string) {
  await page.setExtraHTTPHeaders(clientAddressHeaders());
  // Type only after hydration, or React resets the controlled fields.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Staff have an authenticator; makers (just verified by the seed) go straight in.
  const code = page.getByLabel("Authenticator or recovery code");
  await Promise.race([code.waitFor({ timeout: 30_000 }), page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })]);
  if (await code.isVisible()) {
    await code.fill(await nextTotp(mfaSecret!));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Space" }).first();

test("a machine manager sees both settings areas and reaches email and chat settings", async ({ page }) => {
  await signIn(page, "owner@demo.test");
  await page.goto("/dashboard/tinkerspace");
  await expect(nav(page).getByRole("link", { name: "Space settings" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Machine settings" })).toBeVisible();
  await page.goto("/dashboard/tinkerspace/settings/email");
  await expect(page.getByRole("heading", { name: "Your own email" })).toBeVisible();
  await page.goto("/dashboard/tinkerspace/settings/notifications");
  await expect(page.getByRole("button", { name: "Add channel" })).toBeVisible();
});

test("a machine type manager gets machine settings but is sent back from space settings", async ({ page }) => {
  await signIn(page, "machines@demo.test");
  await page.goto("/dashboard/tinkerspace/machine-settings");
  await expect(page.getByRole("heading", { name: "Machine settings", level: 1 })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Space settings" })).toHaveCount(0);
  await page.goto("/dashboard/tinkerspace/settings");
  await expect(page).toHaveURL(/\/dashboard\/tinkerspace$/);
});

test("a viewer reads machine settings without edit controls", async ({ page }) => {
  await signIn(page, "viewer@demo.test");
  await page.goto("/dashboard/tinkerspace");
  await expect(nav(page).getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Space settings" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Machine settings" })).toBeVisible();
  await page.goto("/dashboard/tinkerspace/machine-settings");
  await expect(page.getByRole("heading", { name: "Machine settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New type" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive type", exact: true })).toHaveCount(0);
});

test("a maker sees their spaces but not the staff dashboard", async ({ page }) => {
  await signIn(page, "maker@demo.test");
  await page.goto("/account");
  await expect(page.getByRole("link", { name: "Tinkerspace" })).toBeVisible();
  const response = await page.goto("/dashboard/tinkerspace");
  expect(response?.status()).toBe(404);
});
