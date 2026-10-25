import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { expect } from "vitest";
import { prisma } from "@/lib/db";
import { DEFAULT_FILE_POLICY } from "@/lib/machines/filePolicy";
import { machineFileKey } from "@/lib/storage/machineFiles";

export const machineDetails = {
  name: "Test laser", manufacturer: "Maker", model: "One", serialNumber: "PRIVATE-SERIAL",
  location: "Workshop", description: "Public description", notes: "PRIVATE-NOTES", firmwareVersion: "1.0",
  acquiredOn: new Date("2025-01-01T00:00:00Z"), purchaseCost: 12345, specs: {},
};

export const poolDetails = {
  material: "PLA", colour: "Blue", colourHex: "#0000FF", brand: "Maker", lotCode: "lot-1",
  lowThreshold: "2", costPerUnit: 100, isPublic: true,
};

export const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(run);

/** Unique, real tenants per test file; cleanup deletes only these tenants and their outbox rows. */
export async function machinesFixture() {
  const suffix = randomUUID().replaceAll("-", "");
  const rows = await transaction(async (tx) => {
    const tenants = [];
    for (const label of ["home", "away"]) {
      const user = await tx.user.create({ data: { email: `${label}-${suffix}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } });
      const space = await tx.space.create({ data: { name: `${label} workshop`, slug: `${label}-${suffix}`, status: "ACTIVE", visibility: "PUBLIC" } });
      await tx.spaceMember.create({ data: { spaceId: space.id, userId: user.id, role: "MACHINE_MANAGER" } });
      const type = await tx.machineType.create({ data: { spaceId: space.id, slug: `${label}-laser`, name: `${label} laser`, filePolicy: DEFAULT_FILE_POLICY } });
      const machine = await tx.machine.create({ data: { ...machineDetails, spaceId: space.id, typeId: type.id, slug: `${label}-machine`, isPublic: true } });
      const pool = await tx.consumablePool.create({ data: { ...poolDetails, spaceId: space.id, unit: "GRAMS", initialQuantity: "0", remainingQuantity: "0" } });
      const photo = await tx.machinePhoto.create({ data: { spaceId: space.id, machineId: machine.id,
        storageKey: machineFileKey(space.id, machine.id, "photos", "webp"), alt: `${label} photo` } });
      const document = await tx.machineDocument.create({ data: { spaceId: space.id, machineId: machine.id,
        storageKey: machineFileKey(space.id, machine.id, "documents", "pdf"), title: "Manual", filename: "manual.pdf",
        contentType: "application/pdf", sizeBytes: 32, isPublic: true } });
      tenants.push({ user, space, type, machine, pool, photo, document });
    }
    return tenants;
  });
  const ids = rows.map((row) => row.space.id);
  return {
    home: rows[0], away: rows[1],
    async cleanup() {
      await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'spaceId' = ANY(${ids})`;
      // Whole-space deletion is the supported escape hatch for append-only ledger cleanup.
      await prisma.space.deleteMany({ where: { id: { in: ids } } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: rows.map((row) => row.user.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: rows.map((row) => row.user.id) } } });
      await prisma.$disconnect();
    },
  };
}

export type MachinesFixture = Awaited<ReturnType<typeof machinesFixture>>;

/** Assert exactly one audit row was committed by this operation, with its actor and tenant. */
export async function audited<T>(context: MachinesFixture["home"], action: string, targetId: string | null, run: () => Promise<T>, metadata?: Record<string, unknown>) {
  const where = { spaceId: context.space.id };
  const before = await prisma.auditEvent.findMany({ where, select: { id: true } });
  const result = await run();
  const added = await prisma.auditEvent.findMany({ where: { ...where, id: { notIn: before.map((row) => row.id) } } });
  expect(added).toEqual([expect.objectContaining({ action, spaceId: context.space.id, actorUserId: context.user.id,
    ...(targetId ? { targetId } : {}), ...(metadata ? { metadata: expect.objectContaining(metadata) } : {}) })]);
  return result;
}
