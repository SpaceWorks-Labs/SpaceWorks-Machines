import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, CAPABILITIES, spaceAllows } from "@/lib/permissionRoles";
import { machineFileUrl } from "@/lib/machines/fileAccess";
import { faultNumber } from "@/lib/upkeep/labels";
import { inScope, rolesForType } from "@/lib/typeScope";
import { loadRepairPanel } from "@/lib/repairs/view";

/** One fault: details, photos, linked records, and the workflow for maintenance managers. */
export async function loadFaultView({ params }: { params: Promise<{ spaceSlug: string; number: string }> }) {
  const { spaceSlug, number } = await params;
  const { space, membership, typeScope } = await requireSpaceCapability(spaceSlug, "maintenance.view");
  const value = Number(number);
  if (!Number.isInteger(value) || value < 1) notFound();
  const fault = await prisma.faultReport.findUnique({ where: { spaceId_number: { spaceId: space.id, number: value } },
    include: { photos: { where: { stage: "REPORT" }, select: { id: true, storageKey: true } }, machine: { select: { name: true, slug: true, typeId: true } } } });
  if (!fault || !inScope(typeScope, fault.machine.typeId)) notFound();
  const canManage = can(membership.role, "maintenance.manage") && spaceAllows(space.status, "maintenance.manage");
  const people = [fault.reportedById, fault.assignedToId, fault.resolvedById].filter((id): id is string => Boolean(id));
  const [profile, users, assignees, logs, repair, pools] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true, currency: true, locale: true } }),
    prisma.user.findMany({ where: { id: { in: people } }, select: { id: true, name: true } }),
    canManage ? prisma.spaceMember.findMany({ where: { spaceId: space.id, status: "ACTIVE", ...rolesForType(CAPABILITIES["maintenance.manage"], fault.machine.typeId) },
      select: { userId: true, user: { select: { name: true, email: true } } } }) : [],
    prisma.maintenanceLog.findMany({ where: { spaceId: space.id, faultId: fault.id }, orderBy: { performedAt: "desc" }, select: { id: true, summary: true, performedAt: true } }),
    loadRepairPanel(space, fault, membership),
    can(membership.role, "tobuy.request") ? prisma.consumablePool.findMany({ where: { spaceId: space.id, isActive: true }, orderBy: { material: "asc" },
      select: { id: true, material: true, colour: true, brand: true, unit: true } }) : [],
  ]);
  const name = (id: string | null) => (id && users.find((user) => user.id === id)?.name) || (id ? "A former member" : null);
  return {
    space: { ...space, ...profile }, canManage, repair,
    canToBuy: can(membership.role, "tobuy.request") && spaceAllows(space.status, "tobuy.request"),
    pools: pools.map((pool) => ({ id: pool.id, label: [pool.brand, pool.material, pool.colour].filter(Boolean).join(" "), unit: pool.unit.toLowerCase() })),
    fault: { id: fault.id, number: fault.number, label: faultNumber(fault.number), title: fault.title, description: fault.description, severity: fault.severity,
      status: fault.status, resolution: fault.resolution, createdAt: fault.createdAt.toISOString(), resolvedAt: fault.resolvedAt?.toISOString() ?? null,
      reportedBy: name(fault.reportedById), assignedTo: name(fault.assignedToId), assignedToId: fault.assignedToId,
      closed: fault.status === "RESOLVED" || fault.status === "WONT_FIX", machine: { name: fault.machine.name, slug: fault.machine.slug } },
    photos: fault.photos.map((photo) => ({ id: photo.id, url: machineFileUrl(photo.storageKey) })),
    assignees: assignees.map((member) => ({ id: member.userId, name: member.user.name || member.user.email || "Staff member" })),
    logs: logs.map((log) => ({ ...log, performedAt: log.performedAt.toISOString() })),
  };
}
