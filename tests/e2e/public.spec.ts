import { expect, test } from "@playwright/test";

// Public pages need no seeded data: these run against any fresh installation.

test("the landing page renders without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("health answers and every page carries the security headers", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true });

  const page = await request.get("/login");
  const headers = page.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBeTruthy();
});

test("a wrong password is refused without saying which part was wrong", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[autocomplete="email"]', `nobody-${Date.now()}@example.test`);
  await page.fill('input[autocomplete="current-password"]', "not the right password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Sign in" }).getByRole("alert")).toHaveText("Invalid email or password.");
  await expect(page).toHaveURL(/\/login/);
});

test("an unknown space page is not found", async ({ page }) => {
  const response = await page.goto(`/s/no-such-space-${Date.now()}`);
  expect(response?.status()).toBe(404);
});

test("signed-out visitors are sent to sign in from the dashboard and their account", async ({ page }) => {
  for (const path of ["/dashboard", "/account"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
