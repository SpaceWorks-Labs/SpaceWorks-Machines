import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Technician } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reportFault } from "@/lib/upkeep";
import { approveRepairAmount, recordFix, recordRepairPayout, verifyRepair } from "@/lib/repairs/fix";
import { answerRepairRequest, RepairError, RepairNotFoundError, requestForToken, sendRepairRequests } from "@/lib/repairs/requests";
import { saveTechnician, TechnicianError } from "@/lib/repairs/technicians";
import { advanceToBuy, requestToBuy, ToBuyError, ToBuyNotFoundError } from "@/lib/repairs/toBuy";
import { machinesFixture, transaction, type MachinesFixture } from "../helpers/machines-db";

/** Repairs: asking many technicians, first accept wins, the fix, the check and the payout ledger. */
let f: MachinesFixture;
let external: Technician, other: Technician, staff: Technician;
const extraUsers: string[] = [];
const actor = () => ({ spaceId: f.home.space.id, actorId: f.home.user.id });
const fault = async (title = "Laser won't fire") => (await transaction((tx) => reportFault(tx, actor(), { machineId: f.home.machine.id, severity: "HIGH", title }))).fault;
const outbox = (kind: string) => prisma.$queryRaw<Array<{ payload: Record<string, string> }>>`
  SELECT "payload" FROM "OutboxMessage" WHERE "kind" = ${kind} AND "payload"->>'spaceId' = ${f.home.space.id}`;
const tokenFor = async (requestId: string) => (await outbox("repair-request")).find((row) => row.payload.requestId === requestId && row.payload.token)?.payload.token;

beforeAll(async () => {
  f = await machinesFixture();
  const h = f.home;
  const tech = await prisma.user.create({ data: { email: `tech-${h.space.id}@example.test`, name: "Staff Tech", emailVerified: new Date(), mfaEnabledAt: new Date() } });
  extraUsers.push(tech.id);
  await prisma.spaceMember.create({ data: { spaceId: h.space.id, userId: tech.id, role: "TECHNICIAN" } });
  await prisma.chatChannel.create({ data: { spaceId: h.space.id, kind: "WHATSAPP", name: "Team", events: [], configEncrypted: "x" } });
  [external, other, staff] = await transaction(async (tx) => [
    await saveTechnician(tx, actor(), { kind: "EXTERNAL", name: "Ravi", email: "ravi@example.test", whatsapp: "+919876543210", skills: ["Laser", " laser ", "Electrical"] }),
    await saveTechnician(tx, actor(), { kind: "EXTERNAL", name: "Meera", email: "meera@example.test", telegramChatId: "123456" }),
    await saveTechnician(tx, actor(), { kind: "STAFF", userId: tech.id, name: "" }),
  ]);
});
afterAll(async () => {
  await f?.cleanup();
  await prisma.user.deleteMany({ where: { id: { in: extraUsers } } });
});

describe.sequential("the technician directory", () => {
  it("keeps skills tidy, links staff to their membership and needs a way to reach outsiders", async () => {
    expect(external.skills).toEqual(["laser", "electrical"]);
    expect(staff).toMatchObject({ kind: "STAFF", name: "Staff Tech" });
    await expect(transaction((tx) => saveTechnician(tx, actor(), { kind: "EXTERNAL", name: "Nobody" }))).rejects.toThrow(TechnicianError);
    await expect(transaction((tx) => saveTechnician(tx, actor(), { kind: "STAFF", userId: f.home.user.id, name: "Manager" }))).rejects.toThrow("staff");
    expect(await prisma.auditEvent.count({ where: { spaceId: f.home.space.id, action: "technician.added" } })).toBe(3);
  });
});

describe.sequential("asking technicians", () => {
  it("sends each one on every channel they have, and only the first to accept takes the repair", async () => {
    const broken = await fault();
    const sent = await transaction((tx) => sendRepairRequests(tx, actor(), { faultId: broken.id, technicianIds: [external.id, other.id, staff.id] }));
    const by = (id: string) => sent.find((request) => request.technicianId === id)!;
    expect(by(external.id).channels).toEqual(["email", "whatsapp"]);
    expect(by(other.id).channels).toEqual(["email"]);
    expect(by(staff.id).channels).toEqual(["email", "inbox"]);
    expect(by(staff.id).tokenHash).toBeNull();
    expect((await outbox("repair-request-chat")).map((row) => row.payload.requestId)).toEqual([by(external.id).id]);
    const [ravi, meera] = [await tokenFor(by(external.id).id), await tokenFor(by(other.id).id)];
    expect(ravi).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await requestForToken(prisma, ravi!)).not.toBeNull();

    const answers = await Promise.all([external, other].map((technician) => transaction((tx) =>
      answerRepairRequest(tx, { spaceId: f.home.space.id, requestId: by(technician.id).id, technicianId: technician.id, accept: true }))));
    expect(answers.map((answer) => answer.outcome).sort()).toEqual(["accepted", "taken"]);
    const after = await prisma.faultReport.findUniqueOrThrow({ where: { id: broken.id } });
    const winner = after.technicianId === external.id ? ravi : meera, loser = winner === ravi ? meera : ravi;
    expect(await requestForToken(prisma, winner!)).toMatchObject({ status: "ACCEPTED" });
    expect(await requestForToken(prisma, loser!)).toBeNull();
    expect(await prisma.repairRequest.findUniqueOrThrow({ where: { id: by(staff.id).id } })).toMatchObject({ status: "CLOSED" });
    await expect(transaction((tx) => sendRepairRequests(tx, actor(), { faultId: broken.id, technicianIds: [staff.id] }))).rejects.toThrow("already took");
  });

  it("expires requests, refuses foreign technicians and keeps type managers to their types", async () => {
    const broken = await fault("Belt slipping");
    await expect(transaction((tx) => sendRepairRequests(tx, actor(), { faultId: broken.id, technicianIds: ["foreign-technician"] }))).rejects.toThrow(RepairError);
    await expect(transaction((tx) => sendRepairRequests(tx, { spaceId: f.away.space.id, actorId: f.away.user.id }, { faultId: broken.id, technicianIds: [external.id] }))).rejects.toThrow(RepairNotFoundError);
    const [request] = await transaction((tx) => sendRepairRequests(tx, actor(), { faultId: broken.id, technicianIds: [other.id] }));
    await prisma.repairRequest.update({ where: { id: request!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await transaction((tx) => answerRepairRequest(tx, { spaceId: f.home.space.id, requestId: request!.id, technicianId: other.id, accept: true }))).toEqual({ outcome: "expired" });
    expect(await prisma.repairRequest.findUniqueOrThrow({ where: { id: request!.id } })).toMatchObject({ status: "EXPIRED" });
    const typeManager = await prisma.user.create({ data: { email: `tech-tm-${f.home.space.id}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } });
    extraUsers.push(typeManager.id);
    await prisma.spaceMember.create({ data: { spaceId: f.home.space.id, userId: typeManager.id, role: "TYPE_MANAGER" } });
    await expect(transaction((tx) => sendRepairRequests(tx, { spaceId: f.home.space.id, actorId: typeManager.id }, { faultId: broken.id, technicianIds: [other.id] }))).rejects.toThrow(RepairNotFoundError);
  });
});

describe.sequential("the fix and the money", () => {
  it("records the fix, checks it, and pays in parts up to the approved amount through the ledgers", async () => {
    const broken = await fault("Tube flickers");
    const [request] = await transaction((tx) => sendRepairRequests(tx, actor(), { faultId: broken.id, technicianIds: [external.id] }));
    await transaction((tx) => answerRepairRequest(tx, { spaceId: f.home.space.id, requestId: request!.id, technicianId: external.id, accept: true }));
    const fix = (input: { fixed: boolean; amountAsked: number | null; technicianId?: string }) => transaction((tx) => recordFix(tx, { spaceId: f.home.space.id, faultId: broken.id,
      technicianId: input.technicianId ?? external.id, actorId: null, remarks: "Replaced the tube", parts: "CO2 tube", amountAsked: input.amountAsked, fixed: input.fixed }));
    await expect(fix({ fixed: true, amountAsked: 5000, technicianId: other.id })).rejects.toThrow("Only the technician");
    await expect(transaction((tx) => approveRepairAmount(tx, actor(), { faultId: broken.id, amount: 4000 }))).rejects.toThrow("Say why");
    expect(await fix({ fixed: true, amountAsked: 5000 })).toMatchObject({ status: "FIXED", amountAsked: 5000 });
    await expect(transaction((tx) => verifyRepair(tx, actor(), { faultId: broken.id, approve: false, reason: "" }))).rejects.toThrow("Say why");
    await transaction((tx) => verifyRepair(tx, actor(), { faultId: broken.id, approve: false, reason: "Still flickers" }));
    expect(await prisma.faultReport.findUniqueOrThrow({ where: { id: broken.id } })).toMatchObject({ status: "IN_PROGRESS", reopenReason: "Still flickers" });
    await fix({ fixed: true, amountAsked: 5000 });
    await transaction((tx) => verifyRepair(tx, actor(), { faultId: broken.id, approve: true }));
    expect(await prisma.faultReport.findUniqueOrThrow({ where: { id: broken.id } })).toMatchObject({ status: "RESOLVED", verifiedById: f.home.user.id });
    expect(await prisma.maintenanceLog.findFirst({ where: { faultId: broken.id } })).toMatchObject({ kind: "CORRECTIVE", cost: null, partsNote: "CO2 tube" });
    expect(await requestForToken(prisma, (await tokenFor(request!.id))!)).toBeNull();

    await expect(transaction((tx) => recordRepairPayout(tx, actor(), { faultId: broken.id, amount: 100, method: "CASH" }))).rejects.toThrow("Approve the amount");
    await transaction((tx) => approveRepairAmount(tx, actor(), { faultId: broken.id, amount: 4500, reason: "Agreed discount" }));
    await expect(transaction((tx) => recordRepairPayout(tx, actor(), { faultId: broken.id, amount: 5000, method: "CASH" }))).rejects.toThrow("more than is still due");
    await expect(transaction((tx) => recordRepairPayout(tx, actor(), { faultId: broken.id, amount: 1000, method: "UPI" }))).rejects.toThrow("reference");
    const first = await transaction((tx) => recordRepairPayout(tx, actor(), { faultId: broken.id, amount: 1500, method: "UPI", reference: "UPI-1" }));
    expect(await prisma.faultReport.findUniqueOrThrow({ where: { id: broken.id } })).toMatchObject({ paidAmount: 1500, payoutStatus: "PARTLY_PAID" });
    await transaction((tx) => recordRepairPayout(tx, actor(), { faultId: broken.id, amount: 3000, method: "CASH" }));
    expect(await prisma.faultReport.findUniqueOrThrow({ where: { id: broken.id } })).toMatchObject({ paidAmount: 4500, payoutStatus: "PAID" });
    const ledger = await prisma.financeEntry.findMany({ where: { spaceId: f.home.space.id, category: "REPAIR_PAYOUT" }, orderBy: { amountMinor: "asc" } });
    expect(ledger.map((row) => [row.amountMinor, row.method, row.technicianId, row.machineId])).toEqual([[1500, "UPI", external.id, f.home.machine.id], [3000, "CASH", external.id, f.home.machine.id]]);
    await expect(prisma.repairPayout.update({ where: { id: first.payout.id }, data: { amount: 1 } })).rejects.toThrow(/append-only/);
    await expect(transaction((tx) => approveRepairAmount(tx, actor(), { faultId: broken.id, amount: 1000, reason: "Lower" }))).rejects.toThrow("already paid");
  });
});

describe.sequential("the to-buy list", () => {
  it("goes requested, approved, bought (posting what was spent) and received (restocking the pool)", async () => {
    await expect(transaction((tx) => requestToBuy(tx, actor(), { kind: "CONSUMABLE", title: "PLA", quantity: "2" }))).rejects.toThrow(ToBuyError);
    await expect(transaction((tx) => requestToBuy(tx, actor(), { kind: "CONSUMABLE", title: "PLA", quantity: "2", poolId: f.away.pool.id }))).rejects.toThrow(ToBuyNotFoundError);
    const item = await transaction((tx) => requestToBuy(tx, actor(), { kind: "CONSUMABLE", title: "PLA spools", quantity: "2.5", poolId: f.home.pool.id }));
    await expect(transaction((tx) => advanceToBuy(tx, actor(), item.id, { status: "RECEIVED" }))).rejects.toThrow(ToBuyError);
    await transaction((tx) => advanceToBuy(tx, actor(), item.id, { status: "APPROVED" }));
    await expect(transaction((tx) => advanceToBuy(tx, actor(), item.id, { status: "BOUGHT", amount: 3200, method: "BANK_TRANSFER", supplier: "Robu" }))).rejects.toThrow("reference");
    await transaction((tx) => advanceToBuy(tx, actor(), item.id, { status: "BOUGHT", amount: 3200, method: "BANK_TRANSFER", reference: "NEFT-9", supplier: "Robu" }));
    expect(await prisma.financeEntry.findMany({ where: { sourceType: "ToBuyItem", sourceId: item.id } })).toEqual([expect.objectContaining({ category: "CONSUMABLES", amountMinor: 3200, supplier: "Robu" })]);
    const before = await prisma.consumablePool.findUniqueOrThrow({ where: { id: f.home.pool.id } });
    await transaction((tx) => advanceToBuy(tx, actor(), item.id, { status: "RECEIVED" }));
    const after = await prisma.consumablePool.findUniqueOrThrow({ where: { id: f.home.pool.id } });
    expect(Number(after.remainingQuantity) - Number(before.remainingQuantity)).toBeCloseTo(2.5);
    await expect(transaction((tx) => advanceToBuy(tx, { spaceId: f.away.space.id, actorId: f.away.user.id }, item.id, { status: "CANCELLED" }))).rejects.toThrow(ToBuyNotFoundError);
  });
});
