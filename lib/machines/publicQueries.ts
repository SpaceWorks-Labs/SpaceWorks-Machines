import "server-only";

import type { Prisma } from "@prisma/client";
import { machineFileUrl } from "./fileAccess";
import { readFields, specRows } from "./fields";

/** Deliberately separate from staff projections: no internal machine fields cross the public gateway. */
export const PUBLIC_MACHINE = {
  slug: true, name: true, description: true, status: true, specs: true,
  type: { select: { slug: true, name: true, icon: true, specFields: true } },
} as const satisfies Prisma.MachineSelect;

export const PUBLIC_PHOTO = { storageKey: true, alt: true } as const;

export function publicMachine(row: Prisma.MachineGetPayload<{ select: typeof PUBLIC_MACHINE }>) {
  return {
    slug: row.slug, name: row.name, description: row.description, status: row.status,
    type: { slug: row.type.slug, name: row.type.name, icon: row.type.icon },
    specs: specRows(readFields(row.type.specFields), row.specs, true),
  };
}

export function publicPhoto(row: { storageKey: string; alt: string }) {
  return { url: machineFileUrl(row.storageKey), alt: row.alt };
}
