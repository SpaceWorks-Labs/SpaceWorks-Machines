import { prisma } from "@/lib/db";
import { requireMoneyCapability } from "@/lib/permissions";
import { spaceAllows } from "@/lib/permissionRoles";

/** The technician directory with contact details: the machine manager's (it holds people's phone numbers). */
export async function loadTechniciansView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space } = await requireMoneyCapability(spaceSlug, "technicians.manage");
  const [profile, technicians, staff, channels] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } }),
    prisma.technician.findMany({ where: { spaceId: space.id }, orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { faults: true } } } }),
    prisma.spaceMember.findMany({ where: { spaceId: space.id, role: "TECHNICIAN", status: "ACTIVE" }, select: { userId: true, user: { select: { name: true, email: true } } } }),
    prisma.chatChannel.findMany({ where: { spaceId: space.id, enabled: true, kind: { in: ["WHATSAPP", "TELEGRAM"] } }, select: { kind: true } }),
  ]);
  const listed = new Set(technicians.map((row) => row.userId).filter(Boolean));
  return {
    space: { ...space, ...profile }, canManage: spaceAllows(space.status, "technicians.manage"),
    providers: { whatsapp: channels.some((row) => row.kind === "WHATSAPP"), telegram: channels.some((row) => row.kind === "TELEGRAM") },
    technicians: technicians.map((row) => ({ id: row.id, kind: row.kind, userId: row.userId, name: row.name, email: row.email, phone: row.phone, whatsapp: row.whatsapp,
      telegramChatId: row.telegramChatId, skills: row.skills, preferredChannel: row.preferredChannel, notes: row.notes, isActive: row.isActive, repairs: row._count.faults })),
    staffCandidates: staff.filter((member) => !listed.has(member.userId)).map((member) => ({ userId: member.userId, name: member.user.name || member.user.email || "Technician" })),
  };
}
