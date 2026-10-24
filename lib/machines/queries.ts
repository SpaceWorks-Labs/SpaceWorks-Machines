import "server-only";

import type { MachineStatus, MeteringUnit, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isLowStock, remainingPercent } from "@/lib/consumables/math";
import { machineFileUrl } from "./fileAccess";
import { readFields, type FieldDefinition } from "./fields";
import { readFilePolicy, type FilePolicy } from "./filePolicy";
import { typeWhere, type TypeScope } from "@/lib/typeScope";

/** Serialisable shapes for views (no Decimal or Prisma objects cross the frontend gateway). */

export const TYPE_SUMMARY = { id: true, slug: true, name: true, icon: true, description: true, archivedAt: true, sortOrder: true, consumableUnit: true, meteringUnit: true, presetKey: true } as const;

export type TypeSummary = { id: string; slug: string; name: string; icon: string; description: string; archived: boolean; consumableUnit: MeteringUnit | null; meteringUnit: MeteringUnit; presetKey: string | null };

export function typeSummary(row: Prisma.MachineTypeGetPayload<{ select: typeof TYPE_SUMMARY }>): TypeSummary {
  return { id: row.id, slug: row.slug, name: row.name, icon: row.icon, description: row.description, archived: row.archivedAt !== null, consumableUnit: row.consumableUnit, meteringUnit: row.meteringUnit, presetKey: row.presetKey };
}

export type FullType = TypeSummary & {
  specFields: FieldDefinition[];
  requestFields: FieldDefinition[];
  filePolicy: FilePolicy;
  materials: string[];
  colours: string[];
  acceptsJobs: boolean;
  requiresApproval: boolean;
  allocationPolicy: "FIRST_IDLE" | "STAFF_SELECT";
  maxConcurrentJobs: number | null;
  requesterPicksMachine: boolean;
  maxOpenJobsPerRequester: number | null;
};

export async function loadFullType(spaceId: string, where: { id: string } | { slug: string }): Promise<FullType | null> {
  const row = await prisma.machineType.findFirst({ where: { spaceId, ...where } });
  if (!row) return null;
  return {
    ...typeSummary(row),
    specFields: readFields(row.specFields), requestFields: readFields(row.requestFields), filePolicy: readFilePolicy(row.filePolicy),
    materials: row.materials, colours: row.colours, acceptsJobs: row.acceptsJobs, requiresApproval: row.requiresApproval, allocationPolicy: row.allocationPolicy,
    maxConcurrentJobs: row.maxConcurrentJobs, requesterPicksMachine: row.requesterPicksMachine, maxOpenJobsPerRequester: row.maxOpenJobsPerRequester,
  };
}

export type MachineCard = {
  id: string; slug: string; name: string; typeId: string; status: MachineStatus; statusNote: string; manufacturer: string; model: string;
  location: string; isPublic: boolean; acceptsJobs: boolean; retired: boolean; coverUrl: string | null; coverAlt: string;
};

export const MACHINE_CARD = {
  id: true, slug: true, name: true, typeId: true, status: true, statusNote: true, manufacturer: true, model: true, location: true, isPublic: true, acceptsJobs: true, retiredAt: true,
  photos: { orderBy: { sortOrder: "asc" }, take: 1, select: { storageKey: true, alt: true } },
} as const satisfies Prisma.MachineSelect;

export function machineCard(row: Prisma.MachineGetPayload<{ select: typeof MACHINE_CARD }>): MachineCard {
  const cover = row.photos[0];
  return {
    id: row.id, slug: row.slug, name: row.name, typeId: row.typeId, status: row.status, statusNote: row.statusNote, manufacturer: row.manufacturer, model: row.model,
    location: row.location, isPublic: row.isPublic, acceptsJobs: row.acceptsJobs, retired: row.retiredAt !== null,
    coverUrl: cover ? machineFileUrl(cover.storageKey) : null, coverAlt: cover?.alt ?? "",
  };
}

export const POOL_ROW = {
  id: true, machineId: true, typeId: true, material: true, colour: true, colourHex: true, brand: true, lotCode: true, unit: true, initialQuantity: true,
  remainingQuantity: true, lowThreshold: true, costPerUnit: true, isPublic: true, isActive: true, lowAlertedAt: true, createdAt: true, updatedAt: true,
  machine: { select: { name: true, slug: true } }, type: { select: { name: true } },
} as const satisfies Prisma.ConsumablePoolSelect;

export type PoolRow = {
  id: string; machineId: string | null; typeId: string | null; material: string; colour: string; colourHex: string; brand: string; lotCode: string; unit: MeteringUnit;
  initialQuantity: string; remainingQuantity: string; lowThreshold: string | null; costPerUnit: number | null; isPublic: boolean; isActive: boolean;
  low: boolean; percent: number; binding: { kind: "machine"; label: string; slug: string } | { kind: "type"; label: string } | { kind: "shared"; label: string }; updatedAt: Date;
};

export function poolRow(row: Prisma.ConsumablePoolGetPayload<{ select: typeof POOL_ROW }>): PoolRow {
  const remaining = row.remainingQuantity.toString();
  const threshold = row.lowThreshold?.toString() ?? null;
  return {
    id: row.id, machineId: row.machineId, typeId: row.typeId, material: row.material, colour: row.colour, colourHex: row.colourHex, brand: row.brand, lotCode: row.lotCode, unit: row.unit,
    initialQuantity: row.initialQuantity.toString(), remainingQuantity: remaining, lowThreshold: threshold, costPerUnit: row.costPerUnit, isPublic: row.isPublic, isActive: row.isActive,
    low: row.isActive && isLowStock(remaining, threshold), percent: remainingPercent(remaining, row.initialQuantity.toString()),
    binding: row.machine ? { kind: "machine", label: row.machine.name, slug: row.machine.slug } : row.type ? { kind: "type", label: row.type.name } : { kind: "shared", label: "Whole space" },
    updatedAt: row.updatedAt,
  };
}

/** Machine counts by status for a space (retired machines excluded), plus the retired count. */
export async function machineStatusCounts(spaceId: string, scope: TypeScope = null) {
  const [grouped, retired] = await Promise.all([
    prisma.machine.groupBy({ by: ["status"], where: { spaceId, retiredAt: null, ...typeWhere(scope) }, _count: true }),
    prisma.machine.count({ where: { spaceId, retiredAt: { not: null }, ...typeWhere(scope) } }),
  ]);
  const counts: Record<MachineStatus, number> = { IDLE: 0, RUNNING: 0, PAUSED: 0, RESERVED: 0, MAINTENANCE: 0, OFFLINE: 0 };
  for (const row of grouped) counts[row.status] = row._count;
  return { counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0), retired };
}
