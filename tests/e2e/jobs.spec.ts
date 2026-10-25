import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { clientAddressHeaders } from "./clientAddress";
import { nextTotp } from "./totp";

const password = process.env.DEMO_PASSWORD;
const secret = process.env.DEMO_MFA_SECRET;
test.skip(!password || !secret, "Seed demo accounts with DEMO_PASSWORD and DEMO_MFA_SECRET to run the job journey.");
// Production uploads need private storage. Development uses the domain's database fallback.
test.skip(process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1" && !process.env.S3_ENDPOINT, "Production job files require disposable S3 storage.");

async function signIn(page: Page, email: string, staff = false) {
  await page.setExtraHTTPHeaders(clientAddressHeaders());
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (staff) {
    await page.getByLabel("Authenticator or recovery code").fill(await nextTotp(secret!));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test("a maker submits a file and follows a paid job from review to collection", async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const title = `Prototype ${randomUUID().slice(0, 8)}`;
  await signIn(page, "maker@demo.test");
  await page.goto("/s/tinkerspace/machines/demo-job-printer", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Request a job", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel(/^Description/).fill("A small test bracket");
  await page.getByLabel(/^Finish/).fill("Smooth");
  // Two valid models exceed Next's normal 25 MB proxy clone together; each meets the type's 20 MB policy.
  const model = Buffer.alloc(84 + 50 * 280000); model.writeUInt32LE(280000, 80);
  await page.getByLabel(/^Job files/).setInputFiles(["bracket.stl", "fixture.stl"].map((name) => ({ name, mimeType: "model/stl", buffer: model })));
  await page.getByRole("button", { name: "Request job", exact: true }).click();
  await expect(page).toHaveURL(/\/s\/tinkerspace\/jobs\/\d+$/);
  const makerPath = new URL(page.url()).pathname;
  const number = makerPath.split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const file = page.getByRole("link", { name: "bracket.stl", exact: true });
  await expect(file).toBeVisible();
  expect((await page.request.get((await file.getAttribute("href"))!)).status()).toBe(200);

  const staffContext = await browser.newContext({ baseURL });
  try {
    const staff = await staffContext.newPage();
    await signIn(staff, "manager@demo.test", true);
    await staff.goto(`/dashboard/tinkerspace/jobs/${number}`, { waitUntil: "networkidle" });
    for (const label of ["Approve job", "Start job", "Complete job"]) {
      await staff.getByRole("button", { name: label, exact: true }).click();
      const dialog = staff.getByRole("dialog", { name: label, exact: true });
      if (label === "Approve job") await dialog.getByLabel(/^Estimated minutes/).fill("10");
      if (label === "Complete job") await dialog.getByLabel("Actual minutes", { exact: true }).fill("10");
      await dialog.getByRole("button", { name: label, exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    await staff.getByRole("button", { name: "Record offline payment", exact: true }).click();
    const payment = staff.getByRole("dialog", { name: "Record offline payment", exact: true });
    await payment.getByRole("combobox", { name: "Payment method", exact: true }).click();
    await staff.getByRole("option", { name: "Cash", exact: true }).click();
    await payment.getByLabel("Reference", { exact: true }).fill(`Receipt ${number}`);
    await payment.getByRole("button", { name: "Record offline payment", exact: true }).click();
    await expect(payment).toBeHidden();
    await staff.getByRole("button", { name: "Collect job", exact: true }).click();
    const collect = staff.getByRole("dialog", { name: "Collect job", exact: true });
    await collect.getByRole("button", { name: "Collect job", exact: true }).click();
    await expect(collect).toBeHidden();
  } finally { await staffContext.close(); }

  await page.goto(makerPath, { waitUntil: "networkidle" });
  const timeline = page.getByRole("region", { name: "Timeline" });
  for (const event of ["Submitted", "Approved", "Started", "Completed", "Collected"]) await expect(timeline.getByText(event, { exact: true })).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("requester-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).not.toHaveClass(/sw-theme-(reveal|fade)/);
  await page.screenshot({ path: testInfo.outputPath("requester-dark.png"), fullPage: true });
  await page.getByRole("link", { name: "Public status link" }).click();
  await expect(page.getByText("Collected", { exact: true }).first()).toBeVisible();
  for (const privateValue of ["maker@demo.test", "Receipt", "₹", "A small test bracket", "bracket.stl"]) await expect(page.locator("body")).not.toContainText(privateValue);
});
