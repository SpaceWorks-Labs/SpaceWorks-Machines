import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createPool, restockPool, correctPool, retirePool, updatePool, setPoolPublic } from "@/lib/consumables/pools";
import { audited, machinesFixture, poolDetails, transaction, type MachinesFixture } from "../helpers/machines-db";

let fixture: MachinesFixture;
beforeAll(async () => { fixture = await machinesFixture(); });
afterAll(async () => { await fixture?.cleanup(); });

describe.sequential("consumable pool domain and append-only ledger", () => {
  it("records opening stock, corrections, restocks and retirement with balances and audits", async () => {
    const h = fixture.home;
    const context = { spaceId: h.space.id, actorId: h.user.id };
    const created = await audited(h, "consumable.created", null, () => transaction((tx) => createPool(tx, {
      ...poolDetails, ...context, unit: "GRAMS", initialQuantity: "10.125", binding: { kind: "shared" },
    })));
    const input = { ...context, poolId: created.poolId };
    const readPool = () => prisma.consumablePool.findUniqueOrThrow({ where: { id: input.poolId } });
    const ledger = () => prisma.consumableAdjustment.findMany({ where: { poolId: input.poolId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const notices = () => prisma.outboxMessage.findMany({ where: { kind: "consumable-low-stock", payload: { path: ["poolId"], equals: input.poolId } } });
    expect((await readPool()).remainingQuantity.toString()).toBe("10.125");
    const opening = (await ledger())[0];
    expect(opening).toMatchObject({ spaceId: h.space.id, actorId: h.user.id, kind: "RESTOCK", reason: "Opening stock" });
    expect(opening.delta.toString()).toBe("10.125");
    expect(opening.balanceAfter.toString()).toBe("10.125");
    const correction = await audited(h, "consumable.corrected", input.poolId, () => transaction((tx) => correctPool(tx, {
      ...input, delta: "-8.125", reason: "Counted remaining stock",
    })));
    expect(correction).toMatchObject({ delta: "-8.125", balanceAfter: "2", lowStock: "alerted" });
    const alertedAt = (await readPool()).lowAlertedAt;
    expect(alertedAt).toBeInstanceOf(Date);
    expect(await notices()).toEqual([expect.objectContaining({ payload: { to: h.user.email, spaceId: h.space.id, poolId: input.poolId } })]);
    await audited(h, "consumable.corrected", input.poolId, () => transaction((tx) => correctPool(tx, { ...input, delta: "-1", reason: "Spill" })));
    expect((await readPool()).lowAlertedAt).toEqual(alertedAt);
    expect(await notices()).toHaveLength(1);

    const before = await ledger();
    const auditCount = await prisma.auditEvent.count({ where: { spaceId: h.space.id } });
    await expect(transaction((tx) => correctPool(tx, { ...input, delta: "-1.001", reason: "Too much" }))).rejects.toThrow();
    expect((await readPool()).remainingQuantity.toString()).toBe("1");
    expect(await ledger()).toEqual(before);
    expect(await prisma.auditEvent.count({ where: { spaceId: h.space.id } })).toBe(auditCount);
    const restock = await audited(h, "consumable.restocked", input.poolId, () => transaction((tx) => restockPool(tx, {
      ...input, quantity: "20.5", reason: "New spool", lotCode: "lot-2",
    })));
    expect(restock).toMatchObject({ balanceAfter: "21.5", lowStock: "cleared" });
    expect(await readPool()).toMatchObject({ lowAlertedAt: null, lotCode: "lot-2" });
    expect((await readPool()).initialQuantity.toString()).toBe("21.5");
    await audited(h, "consumable.corrected", input.poolId, () => transaction((tx) => correctPool(tx, { ...input, delta: "-20", reason: "Count" })));
    expect((await readPool()).lowAlertedAt).toBeInstanceOf(Date);
    expect(await notices()).toHaveLength(2);
    await audited(h, "consumable.retired", input.poolId, () => transaction((tx) => retirePool(tx, { ...input, reason: "Discarded" })));
    expect(await readPool()).toMatchObject({ isActive: false, lowAlertedAt: null });
    expect((await readPool()).remainingQuantity.toString()).toBe("0");
    expect(await notices()).toHaveLength(2);
    const rows = await ledger();
    expect(rows[0]).toEqual(opening);
    expect(rows.map((row) => [row.kind, row.delta.toString(), row.balanceAfter.toString()])).toEqual([
      ["RESTOCK", "10.125", "10.125"], ["CORRECTION", "-8.125", "2"], ["CORRECTION", "-1", "1"],
      ["RESTOCK", "20.5", "21.5"], ["CORRECTION", "-20", "1.5"], ["RETIRE", "-1.5", "0"],
    ]);
    expect(rows.at(-1)?.reason).toBe("Discarded");
    await expect(prisma.consumableAdjustment.update({ where: { id: opening.id }, data: { reason: "Rewritten" } })).rejects.toThrow("append-only");
    await expect(prisma.consumableAdjustment.delete({ where: { id: opening.id } })).rejects.toThrow("append-only");
    await expect(prisma.consumablePool.update({ where: { id: input.poolId }, data: { remainingQuantity: "-0.001" } })).rejects.toThrow();
    expect(await ledger()).toEqual(rows);
  });

  it("serialises competing decreases so only one can spend the remaining stock", async () => {
    const h = fixture.home;
    const context = { spaceId: h.space.id, actorId: h.user.id };
    const { poolId } = await transaction((tx) => createPool(tx, { ...poolDetails, ...context, lowThreshold: null,
      unit: "GRAMS", initialQuantity: "3", binding: { kind: "shared" } }));
    const results = await Promise.allSettled([1, 2].map(() => transaction((tx) => correctPool(tx, { ...context, poolId, delta: "-2", reason: "Count" }))));
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((await prisma.consumablePool.findUniqueOrThrow({ where: { id: poolId } })).remainingQuantity.toString()).toBe("1");
    expect(await prisma.consumableAdjustment.count({ where: { poolId } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { targetId: poolId, action: "consumable.corrected" } })).toBe(1);
  });

  it("supports machine and type bindings, zero opening stock and audited metadata edits", async () => {
    const h = fixture.home;
    const context = { spaceId: h.space.id, actorId: h.user.id };
    for (const binding of [{ kind: "machine", machineId: h.machine.id }, { kind: "type", typeId: h.type.id }] as const) {
      const { poolId } = await audited(h, "consumable.created", null, () => transaction((tx) => createPool(tx, {
        ...poolDetails, ...context, unit: "GRAMS", initialQuantity: "0", binding,
      })));
      expect(await prisma.consumableAdjustment.count({ where: { poolId } })).toBe(0);
      expect(await prisma.consumablePool.findUniqueOrThrow({ where: { id: poolId } })).toMatchObject(binding.kind === "machine"
        ? { machineId: h.machine.id, typeId: null } : { machineId: null, typeId: h.type.id });
      await audited(h, "consumable.updated", poolId, () => transaction((tx) => updatePool(tx, { ...poolDetails, ...context, poolId, material: "PETG" })));
      await audited(h, "consumable.visibility_changed", poolId, () => transaction((tx) => setPoolPublic(tx, { ...context, poolId, isPublic: false })));
      expect(await prisma.consumablePool.findUniqueOrThrow({ where: { id: poolId } })).toMatchObject({ material: "PETG", isPublic: false });
      await audited(h, "consumable.retired", poolId, () => transaction((tx) => retirePool(tx, { ...context, poolId, reason: "Empty" })));
      expect(await prisma.consumableAdjustment.count({ where: { poolId } })).toBe(0);
    }
  });

  it("rolls back balances, ledger, audit and low-stock email with the transaction", async () => {
    const h = fixture.home;
    const input = { spaceId: h.space.id, actorId: h.user.id, poolId: h.pool.id };
    const before = await prisma.auditEvent.count({ where: { spaceId: h.space.id } });
    await expect(transaction(async (tx) => {
      await restockPool(tx, { ...input, quantity: "5" });
      await correctPool(tx, { ...input, delta: "-4", reason: "Count" });
      throw new Error("Abort transaction");
    })).rejects.toThrow("Abort transaction");
    expect(await prisma.consumablePool.findUniqueOrThrow({ where: { id: h.pool.id } })).toMatchObject({ lowAlertedAt: null });
    expect((await prisma.consumablePool.findUniqueOrThrow({ where: { id: h.pool.id } })).remainingQuantity.toString()).toBe("0");
    expect(await prisma.consumableAdjustment.count({ where: { poolId: h.pool.id } })).toBe(0);
    expect(await prisma.outboxMessage.count({ where: { payload: { path: ["poolId"], equals: h.pool.id } } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { spaceId: h.space.id } })).toBe(before);
  });
});
