import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditRowSelect } from "@/components/super-admin/AuditTable";
type Props = {
  searchParams: Promise<{ q?: string; page?: string; }>;
};

export async function loadSuperAdminAuditView({ searchParams }: Props) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const take = 50;
  const events = await prisma.auditEvent.findMany({
    where: q
      ? {
        OR: [
          { action: { contains: q, mode: "insensitive" } },
          { targetType: { contains: q, mode: "insensitive" } },
          { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
          { space: { is: { name: { contains: q, mode: "insensitive" } } } },
        ],
      }
      : undefined,
    orderBy: { createdAt: "desc" },
    skip: page * take,
    take,
    select: auditRowSelect,
  });
  return { q, events, page };
}
