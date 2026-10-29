import "server-only";

import { prisma } from "@/lib/db";
import { can, isStaffRole, spaceAllows, type Capability } from "@/lib/permissionRoles";
import type { SpaceStatus } from "@prisma/client";
import { scopeForRole } from "@/lib/typeScope";
import { parseMachineFileKey } from "@/lib/storage/machineFiles";
import { spaceShowsMachines } from "@/lib/publicSpace";

/** The app URL a machine photo or document is served from (always through the access check below). */
export function machineFileUrl(storageKey: string) {
  return `/api/uploads/${storageKey}`;
}

/** What a public page may show: an active space's public, in-service machine (and only its public documents). */
function publiclyVisible(machine: { isPublic: boolean; retiredAt: Date | null; space: { status: string; visibility: string } }, documentPublic: boolean) {
  return machine.isPublic && machine.retiredAt === null && spaceShowsMachines(machine.space) && documentPublic;
}

const MACHINE_SELECT = { isPublic: true, retiredAt: true, space: { select: { status: true, visibility: true } } } as const;

/** Direct file URLs enforce the same current MFA and type scope as the dashboard. */
async function staffMayRead(spaceId: string, machineId: string, userId: string, status: string, capability: Capability) {
  const member = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } },
    select: { role: true, status: true, user: { select: { mfaEnabledAt: true } } } });
  if (!member || member.status !== "ACTIVE" || !isStaffRole(member.role) || !member.user?.mfaEnabledAt ||
    !can(member.role, capability) || !spaceAllows(status as SpaceStatus, capability)) return false;
  const scope = await scopeForRole(prisma, spaceId, userId, member.role);
  return scope === null || Boolean(await prisma.machine.findFirst({
    where: { spaceId, id: machineId, typeId: { in: scope } }, select: { id: true },
  }));
}

/**
 * Who may fetch a stored machine file: anyone for a photo or public document of a publicly listed machine,
 * otherwise only active staff of the space (machines.view). Everything else is "not found".
 */
export async function resolveMachineFile(key: string, userId: string | null) {
  const parsed = parseMachineFileKey(key);
  if (!parsed) return null;
  if (parsed.kind === "maintenance" || parsed.kind === "warranty" || parsed.kind === "faults") return resolveUpkeepFile(key, { ...parsed, kind: parsed.kind }, userId);
  const where = { storageKey: key, spaceId: parsed.spaceId, machineId: parsed.machineId };
  const file = parsed.kind === "photos"
    ? await prisma.machinePhoto.findFirst({ where, select: { machine: { select: MACHINE_SELECT } } }).then((row) => row && { machine: row.machine, documentPublic: true, filename: null as string | null })
    : await prisma.machineDocument.findFirst({ where, select: { isPublic: true, filename: true, machine: { select: MACHINE_SELECT } } }).then((row) => row && { machine: row.machine, documentPublic: row.isPublic, filename: row.filename });
  if (!file) return null;
  if (publiclyVisible(file.machine, file.documentPublic)) return { public: true, kind: parsed.kind, filename: file.filename };
  if (!userId) return null;
  if (!await staffMayRead(parsed.spaceId, parsed.machineId, userId, file.machine.space.status, "machines.view")) return null;
  return { public: false, kind: parsed.kind, filename: file.filename };
}

/** Maintenance attachments, warranty documents and fault photos: active staff with maintenance.view only. */
async function resolveUpkeepFile(key: string, parsed: { spaceId: string; machineId: string; kind: "maintenance" | "warranty" | "faults" }, userId: string | null) {
  if (!userId) return null;
  const scope = { storageKey: key, spaceId: parsed.spaceId };
  const file = parsed.kind === "maintenance"
    ? await prisma.maintenanceAttachment.findFirst({ where: { ...scope, log: { machineId: parsed.machineId } }, select: { filename: true } })
    : parsed.kind === "warranty"
      ? await prisma.warrantyDocument.findFirst({ where: { ...scope, warranty: { machineId: parsed.machineId } }, select: { filename: true } })
      : await prisma.faultPhoto.findFirst({ where: { ...scope, fault: { machineId: parsed.machineId } }, select: { id: true } }).then((row) => row && { filename: null as string | null });
  if (!file) return null;
  const space = await prisma.space.findUnique({ where: { id: parsed.spaceId }, select: { status: true } });
  if (!space || !await staffMayRead(parsed.spaceId, parsed.machineId, userId, space.status, "maintenance.view")) return null;
  return { public: false, kind: parsed.kind, filename: file.filename };
}
