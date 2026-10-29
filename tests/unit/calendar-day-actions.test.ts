import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), space: vi.fn(), payout: vi.fn(), purchase: vi.fn(), finance: vi.fn(), machine: vi.fn(),
}));
vi.mock("@/lib/actionAccess", () => ({
  staffAction: mocks.gate, slugOf: (input: { spaceSlug: string }) => input.spaceSlug,
  invalid: () => ({ ok: false, error: "Invalid date" }), revalidate: vi.fn(), refreshMachinePages: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const tx = { space: { findUniqueOrThrow: mocks.space } };
  return { prisma: { ...tx, $transaction: (work: (client: typeof tx) => unknown) => work(tx) } };
});
vi.mock("@/lib/repairs/fix", async (original) => ({ ...await original<object>(), recordRepairPayout: mocks.payout }));
vi.mock("@/lib/repairs/toBuy", async (original) => ({ ...await original<object>(), advanceToBuy: mocks.purchase }));
vi.mock("@/lib/finance/post", async (original) => ({ ...await original<object>(), postManualEntry: mocks.finance }));
vi.mock("@/lib/machines/machines", async (original) => ({ ...await original<object>(), createMachine: mocks.machine }));
vi.mock("@/lib/webhooks/emit", () => ({ enqueueWebhookDeliveries: vi.fn(), emitWebhook: vi.fn() }));

import { recordRepairPayoutAction } from "@/app/actions/repairs";
import { addFinanceEntryAction } from "@/app/actions/finance";
import { advanceToBuyAction } from "@/app/actions/to-buy";
import { createMachineAction } from "@/app/actions/machines";
import { calendarDayAt } from "@/lib/calendarDay";

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T20:34:00Z"));
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ ok: true, space: { id: "authorised-space", slug: "demo" }, membership: { role: "MACHINE_MANAGER" }, userId: "staff" });
  mocks.space.mockResolvedValue({ timezone: "Asia/Kolkata", currency: "INR" });
  for (const write of [mocks.payout, mocks.purchase, mocks.finance]) write.mockResolvedValue({ webhookDeliveryIds: [] });
  mocks.machine.mockResolvedValue({ slug: "machine", missingSpecs: [], webhookDeliveryIds: [] });
});
afterEach(() => vi.useRealTimers());

describe("authorised action calendar dates", () => {
  const actions = [
    { name: "repair payout", run: (day: string) => recordRepairPayoutAction({ spaceSlug: "demo", faultId: "fault", amount: 100, method: "CASH", paidOn: day }), write: mocks.payout, argument: 2, field: "paidAt" },
    { name: "finance entry", run: (day: string) => addFinanceEntryAction({ spaceSlug: "demo", category: "OTHER_INCOME", amount: 100, method: "CASH", note: "Gift", occurredOn: day }), write: mocks.finance, argument: 2, field: "occurredAt" },
    { name: "purchase", run: (day: string) => advanceToBuyAction({ spaceSlug: "demo", itemId: "item", status: "BOUGHT", amount: 100, method: "CASH", boughtOn: day }), write: mocks.purchase, argument: 3, field: "boughtAt" },
  ];

  for (const action of actions) {
    it(`${action.name} resolves today's Kolkata date after local midnight using only the authorised space`, async () => {
      expect(await action.run("2026-10-30")).toMatchObject({ ok: true });
      expect(mocks.space).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "authorised-space" } }));
      const instant = action.write.mock.calls[0]![action.argument][action.field] as Date;
      expect(instant.toISOString()).toBe("2026-10-29T18:30:00.000Z");
      expect(calendarDayAt(instant, "Asia/Kolkata")).toBe("2026-10-30");
    });
    it(`${action.name} preserves tomorrow as future so its domain guard can reject it`, async () => {
      await action.run("2026-10-31");
      const instant = action.write.mock.calls[0]![action.argument][action.field] as Date;
      expect(instant.getTime()).toBeGreaterThan(Date.now());
    });
    it(`${action.name} rejects an impossible calendar date before any write`, async () => {
      expect(await action.run("2026-02-31")).toMatchObject({ ok: false });
      expect(action.write).not.toHaveBeenCalled();
    });
  }

  it("keeps acquiredOn as a date-only value and accepts the current space day", async () => {
    expect(await createMachineAction({ spaceSlug: "demo", name: "Machine", typeId: "type", acquiredOn: "2026-10-30", isPublic: false, acceptsJobs: true })).toMatchObject({ ok: true });
    expect(mocks.machine.mock.calls[0]![1].acquiredOn.toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });

  it("rejects a future acquisition day without creating a machine", async () => {
    expect(await createMachineAction({ spaceSlug: "demo", name: "Machine", typeId: "type", acquiredOn: "2026-10-31", isPublic: false, acceptsJobs: true })).toMatchObject({ ok: false });
    expect(mocks.machine).not.toHaveBeenCalled();
  });
});
