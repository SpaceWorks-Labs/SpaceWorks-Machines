import { spawnSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { db, latestPayload, localPath } from "./outbox";
import { nextTotp } from "./totp";
import { clientAddressHeaders } from "./clientAddress";

// The auth and space journeys end to end, on a fresh database: sign-up, password sign-in, magic link,
// authenticator enrolment, a space created by a super admin, and a maker joining it. Needs DATABASE_URL (the
// server's database) in the test environment; skipped without it.
test.skip(!process.env.DATABASE_URL, "DATABASE_URL must point at the e2e server's database.");
// Each journey signs people up and in (bcrypt, several Server Actions), so allow a slow machine more time.
test.describe.configure({ mode: "serial", timeout: 300_000 });

const run = Date.now().toString(36);
const password = `correct horse battery ${run}`;
const owner = { name: "Olive Owner", email: `owner-${run}@example.test` };
const maker = { name: "Midlaj Maker", email: `maker-${run}@example.test` };
const admin = { email: `admin-${run}@example.test` };
const slug = `kochi-makers-${run}`;
let ownerSecret = "";

async function fresh(browser: Browser) {
  const context = await browser.newContext({ extraHTTPHeaders: clientAddressHeaders() });
  return context.newPage();
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders(clientAddressHeaders());
});

async function signUp(page: Page, person: { name: string; email: string }) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.locator('input[autocomplete="name"]').fill(person.name);
  await page.locator('input[autocomplete="email"]').fill(person.email);
  await page.locator('input[autocomplete="new-password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("check your inbox");
  const { verificationUrl } = await latestPayload("email-verification", person.email);
  await page.goto(localPath(verificationUrl), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(page).toHaveURL(/verified=1/);
}

async function signInWithPassword(page: Page, email: string, secret?: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (secret) {
    await page.getByLabel("Authenticator or recovery code").fill(await nextTotp(secret));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

test.afterAll(async () => {
  await db.$disconnect();
});

test("a person signs up, verifies their email and signs in with a password", async ({ page }) => {
  await signUp(page, owner);
  await signInWithPassword(page, owner.email);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your spaces" })).toBeVisible();
});

test("they turn on an authenticator and then need it to sign in", async ({ page }) => {
  await signInWithPassword(page, owner.email);
  await page.goto("/account/security");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  ownerSecret = (await page.locator("span.font-mono").first().textContent())!.trim();
  // Taken through nextTotp so the sign-in below uses a later step (each step works once).
  await page.getByLabel("Six-digit code").fill(await nextTotp(ownerSecret));
  await page.getByRole("button", { name: "Verify and enable" }).click();
  await expect(page.getByText("Save these one-time recovery codes now.")).toBeVisible();
  // Turning it on signs every session out; the next sign-in asks for the code.
  await signInWithPassword(page, owner.email, ownerSecret);
});

test("a super admin creates a space and its machine manager accepts the emailed invite", async ({ browser }) => {
  const made = spawnSync(process.execPath, ["docker/ops/admin.mjs", "create", "--email", admin.email, "--name", "Root", "--password-stdin"], { input: password, encoding: "utf8", env: process.env });
  expect(made.status, made.stderr).toBe(0);
  const adminPage = await fresh(browser);
  await signInWithPassword(adminPage, admin.email);
  await adminPage.goto("/super-admin/spaces/new");
  await adminPage.getByLabel("Machine manager's email").fill(owner.email);
  await adminPage.getByLabel("Space name").fill("Kochi Makers");
  await adminPage.getByLabel("Web address").fill(slug);
  await adminPage.getByLabel("What does the makerspace do, and who uses its machines?").fill("Printers, a laser cutter and a CNC router for everyone in Kochi.");
  await adminPage.getByLabel("Contact email").fill(`desk-${run}@example.test`);
  await adminPage.getByLabel("City or town").fill("Kochi");
  await adminPage.getByRole("button", { name: "Create and invite the machine manager" }).click();
  await adminPage.waitForURL(/\/super-admin\/spaces\/[a-z0-9]+$/);

  const ownerPage = await fresh(browser);
  await signInWithPassword(ownerPage, owner.email, ownerSecret);
  const invite = await latestPayload("owner-invite", owner.email);
  await ownerPage.goto(`/join/space/${invite.token}`);
  await ownerPage.getByRole("button", { name: "Accept invite" }).click();
  await ownerPage.waitForURL(`**/dashboard/${slug}`);
  await expect(ownerPage.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(ownerPage.getByRole("link", { name: "Machine settings" }).first()).toBeVisible();
});

test("a maker signs in with an emailed link and asks to join, and a machine manager approves", async ({ browser }) => {
  const makerPage = await fresh(browser);
  await signUp(makerPage, maker);
  await makerPage.goto("/login", { waitUntil: "networkidle" });
  await makerPage.locator('input[autocomplete="email"]').fill(maker.email);
  await makerPage.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(makerPage.getByRole("status")).toContainText("a sign-in link is on its way");
  const { url } = await latestPayload("magic-link", maker.email);
  await makerPage.goto(localPath(url), { waitUntil: "networkidle" });
  await makerPage.getByRole("button", { name: "Sign in" }).click();
  await makerPage.waitForURL((next) => !next.pathname.startsWith("/login"));
  // The link works once.
  const again = await fresh(browser);
  await again.goto(localPath(url), { waitUntil: "networkidle" });
  await again.getByRole("button", { name: "Sign in" }).click();
  await expect(again.getByRole("alert").filter({ hasText: "expired" })).toContainText("expired or has already been used");

  await makerPage.goto(`/s/${slug}`);
  await makerPage.getByRole("button", { name: "Ask to join" }).click();
  await expect(makerPage.getByText("Request sent")).toBeVisible();

  const ownerPage = await fresh(browser);
  await signInWithPassword(ownerPage, owner.email, ownerSecret);
  await ownerPage.goto(`/dashboard/${slug}/team`);
  await ownerPage.getByRole("button", { name: `Approve ${maker.name}` }).click();
  await expect(ownerPage.getByText("Waiting for approval · 1")).toHaveCount(0);

  await makerPage.reload();
  await expect(makerPage.getByText("You're a maker at Kochi Makers")).toBeVisible();
  await makerPage.goto("/account");
  await expect(makerPage.getByRole("link", { name: "Kochi Makers" })).toBeVisible();
});
