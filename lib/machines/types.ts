import "server-only";

import type { Prisma } from "@prisma/client";
import { recordAuditEvent, recordSettingsChange } from "@/lib/audit";
import { slugifyTitle } from "@/lib/slug";
import { DEFAULT_FILE_POLICY } from "./filePolicy";
import { DEFAULT_QUEUE_RULES, presetByKey } from "./presets";
import { presetTypeData } from "./provision";
import type { TypeSection } from "./schemas";
import { actorMayUseType } from "@/lib/typeScope";

export class TypeNotFoundError extends Error {
  constructor() {
    super("Machine type not found.");
  }
}

/** A slug free in this space for `model`: "laser-cutter", then "laser-cutter-2"… */
export async function freeSlug(tx: Prisma.TransactionClient, model: "machineType" | "machine", spaceId: string, name: string, exceptId?: string) {
  const base = slugifyTitle(name).slice(0, 60).replace(/-+$/, "") || (model === "machine" ? "machine" : "type");
  const taken = model === "machine"
    ? await tx.machine.findMany({ where: { spaceId, slug: { startsWith: base }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { slug: true } })
    : await tx.machineType.findMany({ where: { spaceId, slug: { startsWith: base }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { slug: true } });
  const used = new Set(taken.map((row) => row.slug));
  for (let n = 1; ; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!used.has(slug)) return slug;
  }
}

const TYPE_SNAPSHOT = {
  name: true, icon: true, description: true, specFields: true, requestFields: true, filePolicy: true, materials: true, colours: true,
  meteringUnit: true, consumableUnit: true, acceptsJobs: true, requiresApproval: true, allocationPolicy: true, maxConcurrentJobs: true,
  requesterPicksMachine: true, maxOpenJobsPerRequester: true,
} as const;

/** A new type from scratch, from a preset, or as a copy of one of the space's types. */
export async function createMachineType(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string; name: string; from: { kind: "blank" } | { kind: "preset"; presetKey: string } | { kind: "type"; typeId: string } }) {
  const last = await tx.machineType.aggregate({ where: { spaceId: input.spaceId }, _max: { sortOrder: true } });
  const sortOrder = (last._max.sortOrder ?? 0) + 10;
  const slug = await freeSlug(tx, "machineType", input.spaceId, input.name);
  let data: Prisma.MachineTypeUncheckedCreateInput;
  if (input.from.kind === "preset") {
    const preset = presetByKey(input.from.presetKey);
    if (!preset) throw new TypeNotFoundError();
    data = { spaceId: input.spaceId, ...presetTypeData(preset, sortOrder), presetKey: null, slug, name: input.name };
  } else if (input.from.kind === "type") {
    const source = await tx.machineType.findFirst({ where: { id: input.from.typeId, spaceId: input.spaceId }, select: { ...TYPE_SNAPSHOT } });
    if (!source) throw new TypeNotFoundError();
    data = {
      ...source, spaceId: input.spaceId, slug, name: input.name, sortOrder,
      specFields: source.specFields as Prisma.InputJsonValue, requestFields: source.requestFields as Prisma.InputJsonValue, filePolicy: source.filePolicy as Prisma.InputJsonValue,
    };
  } else {
    data = { spaceId: input.spaceId, slug, name: input.name, icon: "wrench", filePolicy: DEFAULT_FILE_POLICY, ...DEFAULT_QUEUE_RULES, sortOrder };
  }
  const created = await tx.machineType.create({ data, select: { id: true, slug: true } });
  await recordAuditEvent({ action: "machine_type.created", actorUserId: input.actorId, spaceId: input.spaceId, targetType: "MachineType", targetId: created.id, metadata: { from: input.from.kind }, client: tx });
  return created;
}

/** Save one section of a type; the settings audit row keeps the before and after of what changed. */
export async function updateMachineType(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string; typeId: string; change: TypeSection }) {
  const before = await tx.machineType.findFirst({ where: { id: input.typeId, spaceId: input.spaceId }, select: TYPE_SNAPSHOT });
  if (!before || !(await actorMayUseType(tx, input.spaceId, input.actorId, input.typeId))) throw new TypeNotFoundError();
  const values = input.change.values as Record<string, unknown>;
  await tx.machineType.update({ where: { spaceId_id: { spaceId: input.spaceId, id: input.typeId } }, data: values as Prisma.MachineTypeUpdateInput });
  const snapshot = Object.fromEntries(Object.keys(values).map((key) => [key, (before as Record<string, unknown>)[key]]));
  await recordSettingsChange({ spaceId: input.spaceId, actorUserId: input.actorId, area: `machine.types.${input.change.section}`, before: snapshot, after: values, targetType: "MachineType", targetId: input.typeId, client: tx });
}

/** Archived types leave machine creation and job requests; their machines and history stay. */
export async function setMachineTypeArchived(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string; typeId: string; archived: boolean }) {
  const type = await tx.machineType.findFirst({ where: { id: input.typeId, spaceId: input.spaceId }, select: { archivedAt: true } });
  if (!type) throw new TypeNotFoundError();
  if ((type.archivedAt !== null) === input.archived) return;
  await tx.machineType.update({ where: { spaceId_id: { spaceId: input.spaceId, id: input.typeId } }, data: { archivedAt: input.archived ? new Date() : null } });
  await recordSettingsChange({ spaceId: input.spaceId, actorUserId: input.actorId, area: "machine.types.archive", before: { archived: !input.archived }, after: { archived: input.archived }, targetType: "MachineType", targetId: input.typeId, client: tx });
}

/** The order types appear in everywhere. `typeIds` must be exactly the space's types. */
export async function reorderMachineTypes(tx: Prisma.TransactionClient, input: { spaceId: string; actorId: string; typeIds: string[] }) {
  const types = await tx.machineType.findMany({ where: { spaceId: input.spaceId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
  const current = types.map((type) => type.id);
  if (current.length !== input.typeIds.length || new Set(input.typeIds).size !== current.length || input.typeIds.some((id) => !current.includes(id))) throw new TypeNotFoundError();
  for (const [index, id] of input.typeIds.entries()) {
    await tx.machineType.update({ where: { spaceId_id: { spaceId: input.spaceId, id } }, data: { sortOrder: (index + 1) * 10 } });
  }
  await recordSettingsChange({ spaceId: input.spaceId, actorUserId: input.actorId, area: "machine.types.order", before: { order: current }, after: { order: input.typeIds }, client: tx });
}
