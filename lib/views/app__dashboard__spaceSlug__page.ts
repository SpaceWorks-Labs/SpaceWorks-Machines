import { prisma } from "@/lib/db";
import { can, requireSpaceCapability } from "@/lib/permissions";
import { financePeriod } from "@/lib/finance/period";
import { financeSummary } from "@/lib/finance/summary";

/** The space's home: status, people at a glance and the first steps still to do. */
export async function loadSpaceOverviewView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireSpaceCapability(spaceSlug, "space.view");
  const now = new Date();
  const [details, staffCount, makers, pending, openInvites] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { name: true, slug: true, status: true, logoUrl: true, description: true, contactEmail: true } }),
    prisma.spaceMember.count({ where: { spaceId: space.id, role: { not: "MEMBER" } } }),
    prisma.spaceMember.count({ where: { spaceId: space.id, role: "MEMBER", status: "ACTIVE" } }),
    prisma.spaceMember.count({ where: { spaceId: space.id, role: "MEMBER", status: "PENDING" } }),
    prisma.spaceInvite.count({ where: { spaceId: space.id, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
  ]);
  const base = `/dashboard/${details.slug}`;
  const steps = [
    { id: "logo", label: "Add your logo", description: "It appears on your public page and in emails to makers.", done: Boolean(details.logoUrl), href: `${base}/settings`, visible: can(membership.role, "space.settings") },
    { id: "team", label: "Invite your staff", description: "Machine managers, operators and technicians who help run the machines.", done: staffCount > 1, href: `${base}/team`, visible: can(membership.role, "team.manage") },
    { id: "machines", label: "Add your machines", description: "Printers, laser cutters, CNC and the rest, with what each one can do.", done: await prisma.machine.count({ where: { spaceId: space.id } }) > 0, href: `${base}/machines`, visible: can(membership.role, "machines.manage") },
  ].filter((step) => step.visible);
  return { space: details, role: membership.role, staffCount, makers, pending, openInvites, steps, finance: can(membership.role, "finance.view") ? await monthFinance(space.id) : null };
}

/** This month's money in, out and net (the machine manager's figures only). */
async function monthFinance(spaceId: string) {
  const { timezone } = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { timezone: true } });
  const period = financePeriod("month", null, timezone);
  const rows = await prisma.financeEntry.findMany({ where: { spaceId, occurredAt: { gte: period.from, lt: period.to } }, select: { direction: true, category: true, amountMinor: true, currency: true, method: true } });
  return { label: period.label, totals: financeSummary(rows.map((row) => ({ ...row, machine: null, technician: null, supplier: "" }))).totals };
}
