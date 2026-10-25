import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { db } from "./outbox";
import { signInDemo } from "./signIn";

test.skip(!process.env.DEMO_PASSWORD || !process.env.DEMO_MFA_SECRET || !process.env.DATABASE_URL,
  "DEMO_PASSWORD, DEMO_MFA_SECRET and DATABASE_URL must be set; seed the demo data to run the repair journeys.");

const UPKEEP = "/dashboard/tinkerspace/machines/demo-drill-press/upkeep";

/** Report a fault on the demo drill press and ask the named technicians to repair it. */
async function faultWithRequest(manager: Page, title: string, technicians: string[]) {
  await manager.goto(UPKEEP, { waitUntil: "networkidle" });
  await manager.getByRole("button", { name: "Report a fault" }).click();
  const report = manager.getByRole("dialog");
  await report.getByLabel("What's wrong").fill(title);
  await report.getByRole("button", { name: "Report fault" }).click();
  await expect(report).toBeHidden();
  await manager.goto("/dashboard/tinkerspace/maintenance/faults", { waitUntil: "networkidle" });
  await manager.getByRole("link", { name: new RegExp(title) }).click();
  await manager.getByRole("button", { name: "Ask technicians" }).click();
  const ask = manager.getByRole("dialog", { name: "Ask technicians" });
  for (const name of technicians) await ask.getByRole("checkbox", { name }).click();
  await ask.getByRole("button", { name: "Send request" }).click();
  await expect(ask).toBeHidden();
  await expect(manager.getByRole("region", { name: "Repair requests" })).toContainText(technicians[0]!);
  return manager.url();
}

test("a staff technician takes a repair from their inbox and marks it fixed", async ({ browser }) => {
  test.setTimeout(240_000);
  const title = `Spindle squeals ${randomUUID().slice(0, 8)}`;
  const manager = await (await browser.newContext()).newPage();
  await signInDemo(manager, "manager@demo.test");
  const faultUrl = await faultWithRequest(manager, title, ["Fathima K"]);

  const tech = await (await browser.newContext()).newPage();
  await signInDemo(tech, "tech@demo.test");
  await tech.goto("/dashboard/tinkerspace/repairs", { waitUntil: "networkidle" });
  const asked = tech.getByRole("region", { name: "Requests for you" }).getByRole("listitem").filter({ hasText: title });
  await asked.getByRole("button", { name: "Accept the repair" }).click();
  await expect(tech.getByRole("region", { name: "Your repairs" })).toContainText(title);
  await tech.getByRole("region", { name: "Your repairs" }).getByRole("link", { name: new RegExp(title) }).click();
  const fix = tech.getByRole("form", { name: "Record the fix" });
  await fix.getByLabel("What you fixed").fill("Greased the spindle bearings");
  await fix.getByLabel(/^Amount you ask/).fill("800");
  await fix.getByRole("button", { name: "Mark fixed" }).click();
  await expect(tech.getByText("Greased the spindle bearings")).toBeVisible();
  await expect(tech.getByText("Not paid yet")).toBeVisible();

  await manager.goto(faultUrl, { waitUntil: "networkidle" });
  await manager.getByRole("button", { name: "Check and close" }).click();
  await expect(manager.getByText("Resolved", { exact: true }).first()).toBeVisible();
});

test("an outside technician uses their link, and the machine manager pays them", async ({ browser }) => {
  test.setTimeout(240_000);
  const title = `Belt slips ${randomUUID().slice(0, 8)}`;
  const manager = await (await browser.newContext()).newPage();
  await signInDemo(manager, "manager@demo.test");
  const faultUrl = await faultWithRequest(manager, title, ["Joseph Varghese"]);
  const [row] = await db.$queryRaw<Array<{ token: string }>>`
    SELECT o."payload"->>'token' AS "token" FROM "OutboxMessage" o JOIN "RepairRequest" r ON r."id" = o."payload"->>'requestId'
    JOIN "FaultReport" f ON f."id" = r."faultId" WHERE o."kind" = 'repair-request' AND f."title" = ${title} AND o."payload" ? 'token' LIMIT 1`;
  expect(row?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const outsider = await (await browser.newContext()).newPage();
  await outsider.goto(`/r/${row!.token}`, { waitUntil: "networkidle" });
  await expect(outsider.getByRole("heading", { name: "Demo drill press" })).toBeVisible();
  await outsider.getByRole("button", { name: "Accept the repair" }).click();
  await outsider.getByLabel("What you fixed").fill("Replaced the drive belt");
  await outsider.getByLabel(/^Amount you ask/).fill("1200");
  await outsider.getByRole("button", { name: "Mark fixed" }).click();
  await expect(outsider.getByText("Marked fixed", { exact: true })).toBeVisible();

  await manager.goto(faultUrl, { waitUntil: "networkidle" });
  await manager.getByRole("button", { name: "Check and close" }).click();
  await manager.getByRole("button", { name: "Approve amount" }).click();
  const approve = manager.getByRole("dialog", { name: "Approve the amount" });
  await approve.getByRole("button", { name: "Approve amount" }).click();
  await expect(approve).toBeHidden();
  await manager.getByRole("button", { name: "Record a payout" }).click();
  const payout = manager.getByRole("dialog", { name: "Record a payout" });
  await payout.getByLabel(/^Reference/).fill("UPI-E2E-1");
  await payout.getByRole("button", { name: "Record payout" }).click();
  await expect(payout).toBeHidden();
  await expect(manager.getByRole("region", { name: "Payouts" })).toContainText("UPI-E2E-1");

  await outsider.reload({ waitUntil: "networkidle" });
  await expect(outsider.getByRole("heading", { name: /couldn.t find that page/ })).toBeVisible();
  await manager.goto("/dashboard/tinkerspace/finance", { waitUntil: "networkidle" });
  await expect(manager.getByRole("region", { name: "Ledger entries" })).toContainText("Repair payouts");
});
