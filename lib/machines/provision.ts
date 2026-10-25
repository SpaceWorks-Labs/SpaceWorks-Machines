import "server-only";

import type { Prisma } from "@prisma/client";
import { MACHINE_TYPE_PRESETS, type MachineTypePreset } from "./presets";

/** Requester emails per job event; every one is on until a machine manager turns it off. */
export const DEFAULT_REQUESTER_EMAILS = { submitted: true, approved: true, rejected: true, started: true, completed: true, failed: true, cancelled: true, payment: true, refund: true } as const;
/** Staff alerts per job event (email to jobs.review holders and chat channels). */
export const DEFAULT_STAFF_ALERTS = { submitted: true, cancelled: true, failed: true, payment: true } as const;

/** The columns a preset fills on a new MachineType. */
export function presetTypeData(preset: MachineTypePreset, sortOrder: number) {
  return {
    slug: preset.slug,
    name: preset.name,
    icon: preset.icon,
    description: preset.description,
    presetKey: preset.key,
    specFields: preset.specFields as Prisma.InputJsonValue,
    requestFields: preset.requestFields as Prisma.InputJsonValue,
    filePolicy: preset.filePolicy as Prisma.InputJsonValue,
    materials: preset.materials,
    colours: preset.colours,
    meteringUnit: preset.meteringUnit,
    consumableUnit: preset.consumableUnit,
    ...preset.queue,
    sortOrder,
  };
}

/**
 * Everything a new space needs before anyone opens it: its job policy row with defaults and a copy of every
 * machine type preset. Call inside the transaction that creates the space. Idempotent, so re-running it (or a
 * seed) never duplicates a type.
 */
export async function provisionSpace(tx: Prisma.TransactionClient, spaceId: string) {
  await tx.spaceJobSettings.upsert({
    where: { spaceId },
    create: { spaceId, requesterEmails: DEFAULT_REQUESTER_EMAILS, staffAlerts: DEFAULT_STAFF_ALERTS },
    update: {},
  });
  await tx.machineType.createMany({
    data: MACHINE_TYPE_PRESETS.map((preset, index) => ({ spaceId, ...presetTypeData(preset, (index + 1) * 10) })),
    skipDuplicates: true,
  });
}
