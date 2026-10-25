"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, refreshMachinePages, slugOf, staffAction } from "@/lib/actionAccess";
import { MachineNotFoundError } from "@/lib/machines/machines";
import { removeMachineDocument, removeMachinePhoto, reorderMachinePhotos, updateMachineDocument, updateMachinePhoto } from "@/lib/machines/files";
import { documentMetaSchema, photoMetaSchema } from "@/lib/machines/schemas";
import { deleteMachineFiles } from "@/lib/storage/machineFiles";
import type { ActionResult } from "./space";

/**
 * Edits to machine photos and documents (uploads go through POST /api/spaces/[slug]/machines/[id]/files,
 * since documents run to 20 MB). Machine managers only.
 */

const id = z.string().trim().min(1).max(64);
const NOT_FOUND = { ok: false as const, error: "That file is gone. Reload the page." };

async function run(input: unknown, schema: z.ZodType, work: (spaceId: string, actorId: string, data: never) => Promise<string | void>): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machines.manage");
  if (!access.ok) return access;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let removedKey: string | void;
  try {
    removedKey = await work(access.space.id, access.userId, parsed.data as never);
  } catch (error) {
    if (error instanceof MachineNotFoundError) return NOT_FOUND;
    throw error;
  }
  if (removedKey) await deleteMachineFiles([removedKey]).catch(() => console.error("[machines] stored file removal failed"));
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

export async function updateMachinePhotoAction(input: unknown): Promise<ActionResult> {
  return run(input, photoMetaSchema.extend({ photoId: id }), (spaceId, actorId, data: { photoId: string; alt: string }) =>
    prisma.$transaction((tx) => updateMachinePhoto(tx, { spaceId, actorId, ...data })));
}

export async function removeMachinePhotoAction(input: unknown): Promise<ActionResult> {
  return run(input, z.object({ photoId: id }), (spaceId, actorId, data: { photoId: string }) =>
    prisma.$transaction((tx) => removeMachinePhoto(tx, { spaceId, actorId, photoId: data.photoId })));
}

export async function reorderMachinePhotosAction(input: unknown): Promise<ActionResult> {
  return run(input, z.object({ machineId: id, photoIds: z.array(id).min(1).max(8) }), (spaceId, actorId, data: { machineId: string; photoIds: string[] }) =>
    prisma.$transaction((tx) => reorderMachinePhotos(tx, { spaceId, actorId, ...data })));
}

export async function updateMachineDocumentAction(input: unknown): Promise<ActionResult> {
  return run(input, documentMetaSchema.extend({ documentId: id }), (spaceId, actorId, data: { documentId: string; title: string; kind: "MANUAL" | "SOP" | "SAFETY" | "DATASHEET" | "OTHER"; isPublic: boolean }) =>
    prisma.$transaction((tx) => updateMachineDocument(tx, { spaceId, actorId, ...data })));
}

export async function removeMachineDocumentAction(input: unknown): Promise<ActionResult> {
  return run(input, z.object({ documentId: id }), (spaceId, actorId, data: { documentId: string }) =>
    prisma.$transaction((tx) => removeMachineDocument(tx, { spaceId, actorId, documentId: data.documentId })));
}
