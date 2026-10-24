import "server-only";

import type { MachineDocumentKind, Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { MachineInputError, MachineNotFoundError } from "./machines";
import { MAX_MACHINE_PHOTOS } from "./uploads";
import { actorMayUseMachine } from "@/lib/typeScope";

/** Photo and document rows. The bytes are stored first (lib/storage/machineFiles.ts); these record them. */

async function lockMachineRow(tx: Prisma.TransactionClient, spaceId: string, machineId: string, actorId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Machine" WHERE "id" = ${machineId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  if (!rows[0] || !(await actorMayUseMachine(tx, spaceId, actorId, machineId))) throw new MachineNotFoundError();
}

/** A photo or document's machine must be in the actor's machine-type scope. */
async function assertFileMachine(tx: Prisma.TransactionClient, spaceId: string, actorId: string, row: { machineId: string } | null) {
  if (!row || !(await actorMayUseMachine(tx, spaceId, actorId, row.machineId))) throw new MachineNotFoundError();
}

export async function addMachinePhoto(tx: Prisma.TransactionClient, input: { spaceId: string; machineId: string; actorId: string; storageKey: string; alt: string; width: number | null; height: number | null }) {
  await lockMachineRow(tx, input.spaceId, input.machineId, input.actorId);
  const existing = await tx.machinePhoto.aggregate({ where: { spaceId: input.spaceId, machineId: input.machineId }, _count: true, _max: { sortOrder: true } });
  if (existing._count >= MAX_MACHINE_PHOTOS) throw new MachineInputError({ file: [`A machine has at most ${MAX_MACHINE_PHOTOS} photos. Remove one first.`] });
  const photo = await tx.machinePhoto.create({
    data: { spaceId: input.spaceId, machineId: input.machineId, storageKey: input.storageKey, alt: input.alt, width: input.width, height: input.height, sortOrder: (existing._max.sortOrder ?? 0) + 10 },
    select: { id: true },
  });
  await recordAuditEvent({ action: "machine.photo_added", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: input.machineId, client: tx });
  return photo;
}

export async function updateMachinePhoto(tx: Prisma.TransactionClient, input: { spaceId: string; photoId: string; actorId: string; alt: string }) {
  await assertFileMachine(tx, input.spaceId, input.actorId, await tx.machinePhoto.findFirst({ where: { id: input.photoId, spaceId: input.spaceId }, select: { machineId: true } }));
  const updated = await tx.machinePhoto.updateMany({ where: { id: input.photoId, spaceId: input.spaceId }, data: { alt: input.alt } });
  if (updated.count !== 1) throw new MachineNotFoundError();
}

/** Removes the row and returns the storage key for the caller to delete after commit. */
export async function removeMachinePhoto(tx: Prisma.TransactionClient, input: { spaceId: string; photoId: string; actorId: string }) {
  const photo = await tx.machinePhoto.findFirst({ where: { id: input.photoId, spaceId: input.spaceId }, select: { id: true, machineId: true, storageKey: true } });
  await assertFileMachine(tx, input.spaceId, input.actorId, photo);
  if (!photo) throw new MachineNotFoundError();
  await tx.machinePhoto.delete({ where: { id: photo.id } });
  await recordAuditEvent({ action: "machine.photo_removed", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: photo.machineId, client: tx });
  return photo.storageKey;
}

/** `photoIds` must be exactly the machine's photos; the first is the cover. */
export async function reorderMachinePhotos(tx: Prisma.TransactionClient, input: { spaceId: string; machineId: string; actorId: string; photoIds: string[] }) {
  await lockMachineRow(tx, input.spaceId, input.machineId, input.actorId);
  const photos = await tx.machinePhoto.findMany({ where: { spaceId: input.spaceId, machineId: input.machineId }, select: { id: true } });
  const ids = new Set(photos.map((photo) => photo.id));
  if (ids.size !== input.photoIds.length || new Set(input.photoIds).size !== ids.size || input.photoIds.some((id) => !ids.has(id))) throw new MachineNotFoundError();
  for (const [index, id] of input.photoIds.entries()) await tx.machinePhoto.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } });
  await recordAuditEvent({ action: "machine.photos_reordered", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: input.machineId, client: tx });
}

export async function addMachineDocument(tx: Prisma.TransactionClient, input: { spaceId: string; machineId: string; actorId: string; storageKey: string; title: string; kind: MachineDocumentKind; isPublic: boolean; filename: string; contentType: string; sizeBytes: number }) {
  await lockMachineRow(tx, input.spaceId, input.machineId, input.actorId);
  const document = await tx.machineDocument.create({
    data: { spaceId: input.spaceId, machineId: input.machineId, storageKey: input.storageKey, title: input.title, kind: input.kind, isPublic: input.isPublic, filename: input.filename, contentType: input.contentType, sizeBytes: input.sizeBytes, uploadedById: input.actorId },
    select: { id: true },
  });
  await recordAuditEvent({ action: "machine.document_added", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: input.machineId, metadata: { kind: input.kind }, client: tx });
  return document;
}

export async function updateMachineDocument(tx: Prisma.TransactionClient, input: { spaceId: string; documentId: string; actorId: string; title: string; kind: MachineDocumentKind; isPublic: boolean }) {
  await assertFileMachine(tx, input.spaceId, input.actorId, await tx.machineDocument.findFirst({ where: { id: input.documentId, spaceId: input.spaceId }, select: { machineId: true } }));
  const updated = await tx.machineDocument.updateMany({ where: { id: input.documentId, spaceId: input.spaceId }, data: { title: input.title, kind: input.kind, isPublic: input.isPublic } });
  if (updated.count !== 1) throw new MachineNotFoundError();
  await recordAuditEvent({ action: "machine.document_updated", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "MachineDocument", targetId: input.documentId, metadata: { isPublic: input.isPublic }, client: tx });
}

export async function removeMachineDocument(tx: Prisma.TransactionClient, input: { spaceId: string; documentId: string; actorId: string }) {
  const document = await tx.machineDocument.findFirst({ where: { id: input.documentId, spaceId: input.spaceId }, select: { id: true, machineId: true, storageKey: true } });
  await assertFileMachine(tx, input.spaceId, input.actorId, document);
  if (!document) throw new MachineNotFoundError();
  await tx.machineDocument.delete({ where: { id: document.id } });
  await recordAuditEvent({ action: "machine.document_removed", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "Machine", targetId: document.machineId, client: tx });
  return document.storageKey;
}
