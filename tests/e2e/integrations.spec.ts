import { expect, test } from "@playwright/test";
import { signInDemo } from "./signIn";

test.skip(!process.env.DEMO_PASSWORD || !process.env.DEMO_MFA_SECRET, "DEMO_PASSWORD and DEMO_MFA_SECRET must be set; seed the demo data to run the integrations journey.");

test("a machine manager creates an API key and reads machines with it; a machine type manager runs a simulated printer", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const owner = await (await browser.newContext()).newPage();
  await signInDemo(owner, "manager@demo.test");
  await owner.goto("/dashboard/tinkerspace/integrations", { waitUntil: "networkidle" });
  await owner.getByRole("button", { name: "Create key" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("E2E display");
  await dialog.getByRole("checkbox", { name: "machines:read" }).click();
  await dialog.getByRole("button", { name: "Create key" }).click();
  const token = await dialog.getByRole("textbox", { name: "Copy your key now" }).inputValue();
  expect(token).toMatch(/^swm_[a-f0-9]{12}_/);
  await dialog.getByRole("button", { name: "Done" }).click();

  const response = await request.get("/api/v1/machines?limit=100", { headers: { authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  const body = await response.json() as { data: Array<{ slug: string }> };
  expect(body.data.map((machine) => machine.slug)).toContain("demo-drill-press");
  expect((await request.get("/api/v1/jobs", { headers: { authorization: `Bearer ${token}` } })).status()).toBe(403);
  expect((await request.get("/api/v1/openapi.json")).status()).toBe(200);

  const manager = await (await browser.newContext()).newPage();
  await signInDemo(manager, "machines@demo.test");
  await manager.goto("/dashboard/tinkerspace/machines/demo-drill-press/printer", { waitUntil: "networkidle" });
  await expect(manager.getByText("Coming soon").first()).toBeVisible();
  await manager.getByRole("button", { name: /^(Set up|Edit) connection$/ }).click();
  await manager.getByRole("dialog").getByRole("button", { name: "Save connection" }).click();
  await expect(manager.getByRole("region", { name: "Live telemetry" })).toBeVisible();
  await manager.getByRole("button", { name: "Start a test print" }).click();
  await expect(manager.getByRole("region", { name: "Live telemetry" }).getByText("Printing", { exact: true })).toBeVisible();
  await manager.getByRole("button", { name: "Cancel print" }).click();
  await expect(manager.getByRole("region", { name: "Command log" }).getByText("Cancelled.")).toBeVisible();
});
