import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInDemo } from "./signIn";

test.skip(!process.env.DEMO_PASSWORD || !process.env.DEMO_MFA_SECRET, "DEMO_PASSWORD and DEMO_MFA_SECRET must be set; seed the demo data to run the upkeep journey.");

const UPKEEP = "/dashboard/tinkerspace/machines/demo-drill-press/upkeep";

test("staff log maintenance on a schedule; a maker reports a fault and staff resolve it", async ({ browser }) => {
  test.setTimeout(180_000);
  const suffix = randomUUID().slice(0, 8);
  const staff = await (await browser.newContext()).newPage();
  await signInDemo(staff, "machines@demo.test");
  await staff.goto(UPKEEP, { waitUntil: "networkidle" });
  await expect(staff.getByRole("heading", { name: "Upkeep: Demo drill press" })).toBeVisible();
  await expect(staff.getByRole("region", { name: "Maintenance schedules" }).getByRole("paragraph").filter({ hasText: /^Weekly inspection$/ })).toBeVisible();

  await staff.getByRole("button", { name: "Log maintenance" }).click();
  const log = staff.getByRole("dialog", { name: "Log maintenance" });
  await log.getByLabel("What was done").fill(`Inspected ${suffix}`);
  await log.getByRole("combobox", { name: /^Completes schedule/ }).click();
  await staff.getByRole("option", { name: "Weekly inspection", exact: true }).click();
  await log.getByRole("button", { name: "Save record" }).click();
  await expect(log).toBeHidden();
  await expect(staff.getByText(`Inspected ${suffix}`).first()).toBeVisible();
  await expect(staff.getByRole("region", { name: "Maintenance schedules" }).getByText("On track")).toBeVisible();

  const maker = await (await browser.newContext()).newPage();
  await signInDemo(maker, "maker@demo.test");
  await maker.goto("/s/tinkerspace/machines/demo-drill-press", { waitUntil: "networkidle" });
  await maker.getByRole("button", { name: "Report a problem" }).click();
  const report = maker.getByRole("dialog");
  await report.getByLabel("What's wrong").fill(`Chuck wobbles ${suffix}`);
  await report.getByRole("combobox", { name: "How serious" }).click();
  await maker.getByRole("option", { name: "High", exact: true }).click();
  await report.getByRole("button", { name: "Report problem" }).click();
  await expect(report.getByText("Thanks for reporting it")).toBeVisible();
  await report.getByRole("button", { name: "Done" }).click();

  await staff.goto("/dashboard/tinkerspace/maintenance/faults", { waitUntil: "networkidle" });
  await staff.getByRole("link", { name: new RegExp(`Chuck wobbles ${suffix}`) }).click();
  await expect(staff.getByRole("heading", { name: new RegExp(`Chuck wobbles ${suffix}`) })).toBeVisible();
  await staff.getByRole("button", { name: "Update fault" }).click();
  const update = staff.getByRole("dialog");
  await update.getByRole("combobox", { name: "Status" }).click();
  await staff.getByRole("option", { name: "Resolved", exact: true }).click();
  await update.getByLabel(/^Resolution/).fill("Tightened the chuck");
  await update.getByRole("button", { name: "Save" }).click();
  await expect(update).toBeHidden();
  await expect(staff.getByText("Tightened the chuck")).toBeVisible();
});
