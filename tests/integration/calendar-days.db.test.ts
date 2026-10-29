import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: identity.id }, authenticatedAt: Date.now() }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import { prisma } from "@/lib/db";
import { addFinanceEntryAction } from "@/app/actions/finance";
import { recordRepairPayoutAction } from "@/app/actions/repairs";
import { advanceToBuyAction } from "@/app/actions/to-buy";
import { createMachineAction } from "@/app/actions/machines";
import { reportFault } from "@/lib/upkeep";
import { requestToBuy } from "@/lib/repairs/toBuy";
import { machinesFixture, transaction, type MachinesFixture } from "../helpers/machines-db";

let f: MachinesFixture;
beforeAll(async () => { f = await machinesFixture(); identity.id = f.home.user.id; });
afterAll(async () => { await f?.cleanup(); });
afterEach(() => vi.useRealTimers());

describe.sequential("real calendar-day actions and domain guards", () => {
  it.each([
    ["Asia/Kolkata", "2026-10-29T20:34:00Z", "2026-10-30", "2026-10-31", "2026-10-29T18:30:00.000Z"],
    ["America/Los_Angeles", "2026-10-30T04:34:00Z", "2026-10-29", "2026-10-30", "2026-10-29T07:00:00.000Z"],
  ])("posts the actual %s day and rejects tomorrow across finance, payout, purchase and acquisition", async (timezone, now, today, tomorrow, instant) => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(now));
    await prisma.space.update({ where: { id: f.home.space.id }, data: { timezone } });
    const actor = { spaceId: f.home.space.id, actorId: f.home.user.id };
    const spaceSlug = f.home.space.slug;

    const entryInput = { spaceSlug, amount: 10, category: "OTHER_INCOME", method: "CASH", note: `Calendar ${timezone}` };
    expect(await addFinanceEntryAction({ ...entryInput, occurredOn: today })).toMatchObject({ ok: true });
    const entry = await prisma.financeEntry.findFirstOrThrow({ where: { spaceId: actor.spaceId, note: entryInput.note } });
    expect(entry.occurredAt.toISOString()).toBe(instant);
    expect(await addFinanceEntryAction({ ...entryInput, occurredOn: tomorrow })).toMatchObject({ ok: false, error: "The date can't be in the future." });
    expect(await prisma.financeEntry.count({ where: { spaceId: actor.spaceId, note: entryInput.note } })).toBe(1);

    const technician = await prisma.technician.create({ data: { spaceId: actor.spaceId, kind: "EXTERNAL", name: "Date fixture" } });
    const { fault } = await transaction((tx) => reportFault(tx, actor, { machineId: f.home.machine.id, severity: "LOW", title: "Date fixture repair" }));
    await prisma.faultReport.update({ where: { id: fault.id }, data: { technicianId: technician.id, approvedAmount: 20 } });
    const payoutInput = { spaceSlug, faultId: fault.id, amount: 10, method: "CASH" };
    expect(await recordRepairPayoutAction({ ...payoutInput, paidOn: today })).toMatchObject({ ok: true });
    const payout = await prisma.repairPayout.findFirstOrThrow({ where: { faultId: fault.id } });
    expect(payout.paidAt.toISOString()).toBe(instant);
    expect(await recordRepairPayoutAction({ ...payoutInput, paidOn: tomorrow })).toMatchObject({ ok: false, error: "The date can't be in the future." });
    expect(await prisma.repairPayout.count({ where: { faultId: fault.id } })).toBe(1);

    const item = await transaction((tx) => requestToBuy(tx, actor, { kind: "PART", title: "Date fixture part", quantity: "1" }));
    expect(await advanceToBuyAction({ spaceSlug, itemId: item.id, status: "APPROVED" })).toMatchObject({ ok: true });
    const purchaseInput = { spaceSlug, itemId: item.id, status: "BOUGHT", amount: 10, method: "CASH", supplier: "Fixture supplier" };
    expect(await advanceToBuyAction({ ...purchaseInput, boughtOn: tomorrow })).toMatchObject({ ok: false, error: "The date can't be in the future." });
    expect((await prisma.toBuyItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("APPROVED");
    expect(await advanceToBuyAction({ ...purchaseInput, boughtOn: today })).toMatchObject({ ok: true });
    expect((await prisma.toBuyItem.findUniqueOrThrow({ where: { id: item.id } })).boughtAt?.toISOString()).toBe(instant);

    const machineInput = { spaceSlug, typeId: f.home.type.id, name: `Calendar ${timezone}`, isPublic: false, acceptsJobs: true };
    expect(await createMachineAction({ ...machineInput, acquiredOn: today })).toMatchObject({ ok: true });
    expect((await prisma.machine.findFirstOrThrow({ where: { spaceId: actor.spaceId, name: machineInput.name } })).acquiredOn?.toISOString()).toBe(`${today}T00:00:00.000Z`);
    expect(await createMachineAction({ ...machineInput, acquiredOn: tomorrow })).toMatchObject({ ok: false });
    expect(await prisma.machine.count({ where: { spaceId: actor.spaceId, name: machineInput.name } })).toBe(1);
  });
});
