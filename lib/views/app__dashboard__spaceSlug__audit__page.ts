import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { auditRows, type AuditFilters } from "@/lib/auditLog";

type Props = { params: Promise<{ spaceSlug: string }>; searchParams: Promise<AuditFilters> };

/** The last 200 audit events matching the filters; the CSV export takes up to 10 000. */
export async function loadAuditView({ params, searchParams }: Props) {
  const { spaceSlug } = await params;
  const { space, userId, typeScope } = await requireSpaceCapability(spaceSlug, "audit.view");
  const filters = await searchParams;
  const [profile, rows, people] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true } }),
    auditRows(space.id, filters, 200, { userId, typeScope }),
    prisma.spaceMember.findMany({ where: { spaceId: space.id, role: { not: "MEMBER" } }, select: { userId: true, user: { select: { name: true, email: true } } }, take: 200 }),
  ]);
  return { space: { ...space, ...profile }, rows, filters: { actor: filters.actor ?? "", area: filters.area ?? "", from: filters.from ?? "", to: filters.to ?? "" },
    people: people.map((person) => ({ id: person.userId, name: person.user.name || person.user.email || "Staff member" })) };
}
