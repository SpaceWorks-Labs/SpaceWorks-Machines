import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id }, authenticatedAt: Date.now() } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { createRefund, handBackRefund } from "@/lib/payments/refunds";
import { FinanceError, postFinance, postManualEntry, reverseFinanceEntry } from "@/lib/finance/post";
import { financeMismatches } from "@/lib/finance/consistency";
import { loadFinance } from "@/lib/finance/load";
import { logMaintenance } from "@/lib/upkeep";
import { loadFinanceView } from "@/lib/views/app__dashboard__spaceSlug__finance__page";
import { GET as exportFinance } from "@/app/api/spaces/[spaceSlug]/finance/export/route";
import { paymentsFixture, type PaymentsFixture } from "../helpers/payments-db";

/** The finance ledger: every money movement posts once, in its own transaction, and only the machine manager sees it. */
let f: PaymentsFixture;
const entries = (sourceType: string, sourceId: string) => prisma.financeEntry.findMany({ where: { sourceType, sourceId } });
const actor = () => ({ spaceId: f.spaceId, actorId: f.home.user.id });
const exportAs = (spaceSlug: string) => exportFinance(new Request(`http://localhost/api/spaces/${spaceSlug}/finance/export?period=year&format=csv`),
  { params: Promise.resolve({ spaceSlug }) });

beforeAll(async () => { f = await paymentsFixture(); identity.id = f.home.user.id; });
afterAll(async () => { await f?.cleanup(); });

describe.sequential("posting money movements", () => {
  it("posts a paid job payment once, with the gateway as its method, and its refund as money out", async () => {
    await f.configure("UPFRONT");
    const job = await f.approve();
    const [payment] = await f.payments(job);
    const paid = await f.pay(payment!, "STRIPE");
    const [entry, ...extra] = await entries("Payment", paid.id);
    expect(extra).toHaveLength(0);
    expect(entry).toMatchObject({ direction: "IN", category: "JOB_PAYMENT", amountMinor: paid.amount, currency: paid.currency, method: "GATEWAY_STRIPE", typeId: f.home.type.id });

    const job2 = await f.approve();
    const [cash] = await f.payments(job2);
    await f.pay(cash!, "CASH");
    const refund = await createRefund(f.context(cash!.id), { amount: 400, reason: "OTHER", note: "Partly refunded" });
    await handBackRefund({ spaceId: f.spaceId, actorId: f.home.user.id, refundId: refund.id }, "Cash back");
    await handBackRefund({ spaceId: f.spaceId, actorId: f.home.user.id, refundId: refund.id }, "Cash back again");
    expect(await entries("Refund", refund.id)).toEqual([expect.objectContaining({ direction: "OUT", category: "JOB_REFUND", amountMinor: 400, method: "CASH" })]);
    expect(await financeMismatches(f.spaceId)).toEqual([]);
  });

  it("posts maintenance costs with the record, and catches a source that skipped the ledger", async () => {
    const log = await prisma.$transaction((tx) => logMaintenance(tx, actor(), { machineId: f.home.machine.id, kind: "CORRECTIVE", summary: "New belt", cost: 2500, costMethod: "UPI", vendor: "Robu" }));
    expect(await entries("MaintenanceLog", log.log.id)).toEqual([expect.objectContaining({ category: "MAINTENANCE", amountMinor: 2500, method: "UPI", machineId: f.home.machine.id, supplier: "Robu" })]);
    const skipped = await prisma.maintenanceLog.create({ data: { spaceId: f.spaceId, machineId: f.home.machine.id, summary: "Bypassed", cost: 100 } });
    expect(await financeMismatches(f.spaceId)).toEqual([{ sourceType: "MaintenanceLog", sourceId: skipped.id, expected: 100, posted: null }]);
    await prisma.$transaction((tx) => postFinance(tx, { spaceId: f.spaceId, direction: "OUT", category: "MAINTENANCE", amountMinor: 100, currency: "INR", method: "OTHER",
      occurredAt: new Date(), sourceType: "MaintenanceLog", sourceId: skipped.id }));
    expect(await financeMismatches(f.spaceId)).toEqual([]);
  });

  it("keeps entries append-only, reverses them once with a reason, and guards amounts and currencies", async () => {
    const { entry } = await prisma.$transaction((tx) => postManualEntry(tx, actor(), { category: "OTHER_EXPENSE", amountMinor: 90000, method: "BANK_TRANSFER", note: "Rent", occurredAt: new Date() }));
    await expect(prisma.financeEntry.update({ where: { id: entry!.id }, data: { amountMinor: 1 } })).rejects.toThrow(/append-only/);
    await expect(prisma.financeEntry.delete({ where: { id: entry!.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.$transaction((tx) => reverseFinanceEntry(tx, actor(), entry!.id, ""))).rejects.toThrow(FinanceError);
    const reversal = await prisma.$transaction((tx) => reverseFinanceEntry(tx, actor(), entry!.id, "Entered twice"));
    expect(reversal.entry).toMatchObject({ direction: "IN", category: "REVERSAL", amountMinor: 90000, reversesId: entry!.id });
    await expect(prisma.$transaction((tx) => reverseFinanceEntry(tx, actor(), entry!.id, "Again"))).rejects.toThrow("already reversed");
    await expect(prisma.$transaction((tx) => reverseFinanceEntry(tx, actor(), reversal.entry!.id, "Undo"))).rejects.toThrow("can't itself");
    await expect(prisma.$transaction((tx) => reverseFinanceEntry(tx, { spaceId: f.away.space.id, actorId: f.away.user.id }, entry!.id, "Foreign"))).rejects.toThrow("not found");
    const base = { spaceId: f.spaceId, direction: "IN" as const, category: "OTHER_INCOME" as const, method: "CASH" as const, occurredAt: new Date(), sourceType: "Manual" as const };
    await expect(prisma.$transaction((tx) => postFinance(tx, { ...base, amountMinor: 5, currency: "inr", sourceId: "lower" }))).rejects.toThrow(FinanceError);
    await expect(prisma.$transaction((tx) => postFinance(tx, { ...base, amountMinor: -5, currency: "INR", sourceId: "negative" }))).rejects.toThrow(FinanceError);
    expect((await prisma.$transaction((tx) => postFinance(tx, { ...base, amountMinor: 0, currency: "INR", sourceId: "zero" }))).entry).toBeNull();
    await expect(prisma.$transaction((tx) => postManualEntry(tx, actor(), { category: "PARTS", amountMinor: 5, method: "CASH", note: "Foreign machine",
      occurredAt: new Date(), machineId: f.away.machine.id }))).rejects.toThrow("Machine not found");
  });

  it("sums the period per currency and links entries to where they came from", async () => {
    const finance = await loadFinance(f.home.space, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    const inr = finance.summary.totals.find((row) => row.currency === "INR")!;
    const rows = await prisma.financeEntry.findMany({ where: { spaceId: f.spaceId, currency: "INR" } });
    const sum = (direction: string) => rows.filter((row) => row.direction === direction).reduce((total, row) => total + row.amountMinor, 0);
    expect(inr).toEqual({ currency: "INR", income: sum("IN"), spending: sum("OUT"), net: sum("IN") - sum("OUT") });
    expect(finance.entries.find((entry) => entry.sourceType === "Payment")?.href).toMatch(new RegExp(`^/dashboard/${f.home.space.slug}/jobs/\\d+$`));
  });
});

describe.sequential("who sees finance", () => {
  it("opens the page and the export to the machine manager only; others and other spaces get nothing", async () => {
    identity.id = f.home.user.id;
    const view = await loadFinanceView({ params: Promise.resolve({ spaceSlug: f.home.space.slug }), searchParams: Promise.resolve({ period: "year" }) });
    expect(view.canManage).toBe(true);
    const response = await exportAs(f.home.space.slug);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Job payments");
    expect(await prisma.auditEvent.count({ where: { spaceId: f.spaceId, action: "REPORT_EXPORTED" } })).toBeGreaterThan(0);
    expect((await exportAs(f.away.space.slug)).status).toBe(404);
    for (const role of ["TYPE_MANAGER", "OPERATOR", "TECHNICIAN", "VIEWER"] as const) {
      await prisma.spaceMember.updateMany({ where: { spaceId: f.spaceId, userId: f.home.user.id }, data: { role } });
      expect((await exportAs(f.home.space.slug)).status).toBe(404);
      await expect(loadFinanceView({ params: Promise.resolve({ spaceSlug: f.home.space.slug }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    await prisma.spaceMember.updateMany({ where: { spaceId: f.spaceId, userId: f.home.user.id }, data: { role: "MACHINE_MANAGER" } });
  });
});
