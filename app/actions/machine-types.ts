"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalid, refreshMachinePages, slugOf, staffAction } from "@/lib/actionAccess";
import { createTypeSchema, typeSectionSchema } from "@/lib/machines/schemas";
import { createMachineType, reorderMachineTypes, setMachineTypeArchived, TypeNotFoundError, updateMachineType } from "@/lib/machines/types";
import type { ActionResult } from "./space";

/**
 * Creating, archiving and reordering types are space-wide machine settings (machine managers only). Editing one
 * type is type.settings, so a machine type manager may edit the types assigned to them; updateMachineType checks
 * the scope and answers not-found outside it. Every change is audited.
 */

const NOT_FOUND = { ok: false as const, error: "Machine type not found." };

export async function createMachineTypeAction(input: unknown): Promise<ActionResult<{ slug: string }>> {
  const access = await staffAction(slugOf(input), "machine.settings");
  if (!access.ok) return access;
  const parsed = createTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const created = await prisma.$transaction((tx) => createMachineType(tx, { spaceId: access.space.id, actorId: access.userId, ...parsed.data }));
    refreshMachinePages(access.space.slug);
    return { ok: true, data: { slug: created.slug } };
  } catch (error) {
    if (error instanceof TypeNotFoundError) return NOT_FOUND;
    throw error;
  }
}

const sectionInput = z.object({ typeId: z.string().trim().min(1).max(64) }).and(typeSectionSchema);

/** Save one section of a type (details, spec fields, request fields, file policy, catalogue or queue rules). */
export async function updateMachineTypeSection(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "type.settings");
  if (!access.ok) return access;
  const parsed = sectionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { typeId, ...change } = parsed.data;
  try {
    await prisma.$transaction((tx) => updateMachineType(tx, { spaceId: access.space.id, actorId: access.userId, typeId, change }));
  } catch (error) {
    if (error instanceof TypeNotFoundError) return NOT_FOUND;
    throw error;
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

const archiveInput = z.object({ typeId: z.string().trim().min(1).max(64), archived: z.boolean() });

export async function setMachineTypeArchivedAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machine.settings");
  if (!access.ok) return access;
  const parsed = archiveInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await prisma.$transaction((tx) => setMachineTypeArchived(tx, { spaceId: access.space.id, actorId: access.userId, ...parsed.data }));
  } catch (error) {
    if (error instanceof TypeNotFoundError) return NOT_FOUND;
    throw error;
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}

const reorderInput = z.object({ typeIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200) });

export async function reorderMachineTypesAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "machine.settings");
  if (!access.ok) return access;
  const parsed = reorderInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await prisma.$transaction((tx) => reorderMachineTypes(tx, { spaceId: access.space.id, actorId: access.userId, typeIds: parsed.data.typeIds }));
  } catch (error) {
    if (error instanceof TypeNotFoundError) return { ok: false, error: "The list changed while you were reordering. Reload and try again." };
    throw error;
  }
  refreshMachinePages(access.space.slug);
  return { ok: true };
}
