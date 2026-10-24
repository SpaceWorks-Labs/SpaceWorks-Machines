import { prisma } from "@/lib/db";
import { requireSpaceCapability } from "@/lib/permissions";
import { adapterFor } from "@/lib/printers/adapters";
import { typeWhere } from "@/lib/typeScope";

/** Every machine with its printer connection state; set each one up from the machine's printer page. */
export async function loadPrintersView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, typeScope } = await requireSpaceCapability(spaceSlug, "printers.manage");
  const [profile, machines] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true } }),
    prisma.machine.findMany({ where: { spaceId: space.id, retiredAt: null, ...typeWhere(typeScope) }, orderBy: { name: "asc" },
      select: { slug: true, name: true, type: { select: { name: true } }, connection: { select: { adapter: true, enabled: true, state: true } } } }),
  ]);
  return { space: { ...space, ...profile },
    machines: machines.map((machine) => ({ slug: machine.slug, name: machine.name, type: machine.type.name,
      connection: machine.connection ? { label: adapterFor(machine.connection.adapter).label, enabled: machine.connection.enabled, state: machine.connection.state } : null })) };
}
