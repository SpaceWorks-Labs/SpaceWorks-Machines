import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { machineTypeWhere } from "@/lib/typeScope";
import { faultNumber } from "@/lib/upkeep/labels";

/**
 * Repairs at a glance. A staff technician sees the requests waiting for them and the repairs they took (with
 * only their own amount asked and paid status); managers also see repairs to check and, for the machine
 * manager, approved amounts still to pay.
 */
export async function loadRepairsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership, userId, typeScope } = await requireSpaceCapability(spaceSlug, "maintenance.view");
  const allowed = (capability: Parameters<typeof can>[1]) => can(membership.role, capability) && spaceAllows(space.status, capability);
  const now = new Date();
  const me = await prisma.technician.findFirst({ where: { spaceId: space.id, userId, isActive: true }, select: { id: true } });
  const fault = { select: { id: true, number: true, title: true, severity: true, status: true, machine: { select: { name: true } } } } as const;
  const [profile, requests, mine, toCheck, toPay] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, currency: true, locale: true } }),
    me ? prisma.repairRequest.findMany({ where: { spaceId: space.id, technicianId: me.id, status: "SENT", expiresAt: { gt: now } }, orderBy: { sentAt: "desc" },
      select: { id: true, expiresAt: true, fault } }) : [],
    me ? prisma.faultReport.findMany({ where: { spaceId: space.id, technicianId: me.id, status: { notIn: ["WONT_FIX"] } }, orderBy: { updatedAt: "desc" }, take: 50,
      select: { ...fault.select, amountAsked: true, payoutStatus: true } }) : [],
    allowed("repairs.verify") ? prisma.faultReport.findMany({ where: { spaceId: space.id, status: "FIXED", ...machineTypeWhere(typeScope) }, orderBy: { fixedAt: "asc" }, ...fault }) : [],
    allowed("repairs.pay") ? prisma.faultReport.findMany({ where: { spaceId: space.id, technicianId: { not: null }, OR: [{ approvedAmount: null, status: { in: ["FIXED", "RESOLVED"] } },
      { payoutStatus: { not: "PAID" }, approvedAmount: { gt: 0 } }] }, orderBy: { updatedAt: "asc" }, take: 100,
      select: { ...fault.select, amountAsked: true, approvedAmount: true, paidAmount: true, technician: { select: { name: true } } } }) : [],
  ]);
  const row = (f: { number: number; title: string; severity: string; status: string; machine: { name: string } }) =>
    ({ number: f.number, label: faultNumber(f.number), title: f.title, severity: f.severity, status: f.status, machine: f.machine.name });
  return {
    space: { ...space, ...profile }, isTechnician: Boolean(me),
    requests: requests.map((request) => ({ id: request.id, expiresAt: request.expiresAt.toISOString(), ...row(request.fault) })),
    mine: mine.map((f) => ({ ...row(f), amountAsked: f.amountAsked, payoutStatus: f.payoutStatus })),
    toCheck: toCheck.map(row),
    toPay: toPay.map((f) => ({ ...row(f), technician: f.technician?.name ?? "", amountAsked: f.amountAsked, approvedAmount: f.approvedAmount, paidAmount: f.paidAmount })),
  };
}
