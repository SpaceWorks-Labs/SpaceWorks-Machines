import type { Page } from "@playwright/test";
import { clientAddressHeaders } from "./clientAddress";
import { nextTotp } from "./totp";

/** Sign a seeded demo account in (DEMO_PASSWORD; staff also give the DEMO_MFA_SECRET code). */
export async function signInDemo(page: Page, email: string) {
  await page.setExtraHTTPHeaders(clientAddressHeaders());
  // Type only after hydration, or React resets the controlled fields.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = page.getByLabel("Authenticator or recovery code");
  await Promise.race([code.waitFor({ timeout: 30_000 }), page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })]);
  if (await code.isVisible()) {
    await code.fill(await nextTotp(process.env.DEMO_MFA_SECRET!));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}
