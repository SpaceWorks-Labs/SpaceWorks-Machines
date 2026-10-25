import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { clientAddressHeaders } from "./clientAddress";
import { nextTotp } from "./totp";

const password = process.env.DEMO_PASSWORD;
const mfaSecret = process.env.DEMO_MFA_SECRET;
test.skip(!password || !mfaSecret, "DEMO_PASSWORD and DEMO_MFA_SECRET must be set; seed the demo data to run the machines journey.");
// Photo steps need disposable S3-compatible storage (S3_ENDPOINT); without it the rest of the journey still runs.
const storage = Boolean(process.env.S3_ENDPOINT);

async function signIn(page: Page) {
  await page.setExtraHTTPHeaders(clientAddressHeaders());
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="email"]').fill("machines@demo.test");
  await page.locator('input[autocomplete="current-password"]').fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = page.getByLabel("Authenticator or recovery code");
  await Promise.race([code.waitFor({ timeout: 30_000 }), page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })]);
  if (await code.isVisible()) {
    await code.fill(await nextTotp(mfaSecret!));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test("a machine type manager publishes a machine and photo for anonymous visitors", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const name = `Demo machine ${suffix}`;
  const serial = `INTERNAL-SERIAL-${suffix}`;
  const notes = `Internal staff notes ${suffix}`;
  const statusNote = `Internal maintenance note ${suffix}`;
  const photoAlt = `Photo of ${name}`;
  await signIn(page);
  await page.goto("/dashboard/tinkerspace/machines", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add machine", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add machine", exact: true });
  await add.getByRole("combobox", { name: "Machine type" }).click();
  await page.getByRole("option", { name: "Workshop equipment", exact: true }).click();
  await add.getByLabel("Machine name", { exact: true }).fill(name);
  await add.getByLabel(/^Serial number/).fill(serial);
  await add.getByLabel(/^Staff notes/).fill(notes);
  await add.getByRole("button", { name: "Add machine", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/tinkerspace\/machines\/[^/]+$/);
  const slug = new URL(page.url()).pathname.split("/").at(-1)!;
  const listing = page.getByRole("switch", { name: /^Public listing/ });
  await listing.click();
  await expect(listing).toBeChecked();
  if (storage) {
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#0088cc" } }).png().toBuffer();
    await page.getByLabel("Photo file").setInputFiles({ name: "machine.png", mimeType: "image/png", buffer: png });
    await page.getByLabel(/^Alt text/).fill(photoAlt);
    await page.getByRole("button", { name: "Upload photo", exact: true }).click();
    await expect(page.getByRole("img", { name: photoAlt, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Change status", exact: true }).click();
  const status = page.getByRole("dialog", { name: "Change machine status", exact: true });
  await status.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Maintenance", exact: true }).click();
  await status.getByLabel(/^Status note/).fill(statusNote);
  await status.getByRole("button", { name: "Change status", exact: true }).click();
  await expect(status).toBeHidden();
  await expect(page.locator("#main-content").getByText("Maintenance", { exact: true }).first()).toBeVisible();

  const anonymous = await browser.newContext({ baseURL });
  try {
    expect(await anonymous.cookies()).toEqual([]);
    const visitor = await anonymous.newPage();
    await visitor.goto("/s/tinkerspace/machines");
    const link = visitor.getByRole("link").filter({ has: visitor.getByRole("heading", { name, exact: true }) });
    await expect(link).toHaveAttribute("href", `/s/tinkerspace/machines/${slug}`);
    await link.click();
    await expect(visitor.getByRole("heading", { name, level: 1, exact: true })).toBeVisible();
    await expect(visitor.getByText("Maintenance", { exact: true })).toBeVisible();
    if (storage) {
      const photo = visitor.getByRole("img", { name: photoAlt, exact: true });
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const response = await anonymous.request.get((await photo.getAttribute("src"))!);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/");
    }
    for (const internal of [serial, notes, statusNote, "Serial number", "Staff notes"]) {
      await expect(visitor.locator("body")).not.toContainText(internal);
      expect(await visitor.content()).not.toContain(internal);
    }
  } finally {
    await anonymous.close();
  }
});
