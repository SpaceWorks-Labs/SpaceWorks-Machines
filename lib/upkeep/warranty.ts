import "server-only";
import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { assertMachineScope, day, lockMachine, text, UpkeepError, UpkeepNotFoundError, type Actor } from "./context";

export type WarrantyInput = {
  vendorName?: string; vendorContact?: string; vendorEmail?: string; vendorPhone?: string; contractNumber?: string;
  coverage?: string; purchasedOn?: string | null; startsOn?: string | null; expiresOn?: string | null;
};

export const MAX_WARRANTY_DOCUMENTS = 10;

/** One warranty per machine. A new expiry date re-arms the expiry reminder. */
export async function saveWarranty(tx: Prisma.TransactionClient, actor: Actor & { machineId: string }, input: WarrantyInput) {
  const machine = await lockMachine(tx, actor.spaceId, actor.machineId, actor.actorId);
  const data = {
    vendorName: text(input.vendorName, 200), vendorContact: text(input.vendorContact, 200), vendorEmail: text(input.vendorEmail, 254),
    vendorPhone: text(input.vendorPhone, 40), contractNumber: text(input.contractNumber, 120), coverage: text(input.coverage, 2000),
    purchasedOn: day(input.purchasedOn), startsOn: day(input.startsOn), expiresOn: day(input.expiresOn),
  };
  if (data.startsOn && data.expiresOn && data.expiresOn < data.startsOn) throw new UpkeepError("The expiry date can't be before the start date.");
  const current = await tx.warranty.findUnique({ where: { spaceId_machineId: { spaceId: actor.spaceId, machineId: machine.id } }, select: { expiresOn: true } });
  const expiryChanged = (current?.expiresOn?.getTime() ?? null) !== (data.expiresOn?.getTime() ?? null);
  const warranty = await tx.warranty.upsert({
    where: { spaceId_machineId: { spaceId: actor.spaceId, machineId: machine.id } },
    create: { ...data, spaceId: actor.spaceId, machineId: machine.id },
    update: { ...data, ...(expiryChanged ? { lastNotifiedAt: null } : {}) },
  });
  await recordAuditEvent({ action: current ? "warranty.updated" : "warranty.created", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "Warranty", targetId: warranty.id, client: tx });
  return warranty;
}

export async function addWarrantyDocument(tx: Prisma.TransactionClient, actor: Actor, input: { machineId: string; storageKey: string; filename: string; contentType: string; sizeBytes: number }) {
  const warranty = await tx.warranty.findFirst({ where: { spaceId: actor.spaceId, machineId: input.machineId }, select: { id: true, _count: { select: { documents: true } } } });
  if (!warranty) throw new UpkeepNotFoundError();
  await assertMachineScope(tx, actor.spaceId, actor.actorId, input.machineId);
  if (warranty._count.documents >= MAX_WARRANTY_DOCUMENTS) throw new UpkeepError(`A warranty holds up to ${MAX_WARRANTY_DOCUMENTS} documents.`);
  const row = await tx.warrantyDocument.create({ data: { spaceId: actor.spaceId, warrantyId: warranty.id, storageKey: input.storageKey,
    filename: input.filename, contentType: input.contentType, sizeBytes: input.sizeBytes, uploadedById: actor.actorId } });
  await recordAuditEvent({ action: "warranty.document_added", actorUserId: actor.actorId, spaceId: actor.spaceId, targetType: "Warranty", targetId: warranty.id, client: tx });
  return row;
}
