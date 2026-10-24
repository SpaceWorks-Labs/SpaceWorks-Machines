import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireSpaceTeam } from "@/lib/permissions";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { machineTypeWhere } from "@/lib/typeScope";

/** API keys and webhook endpoints. Secrets never leave the server: keys show their prefix, endpoints their host. */
export async function loadIntegrationsView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  const { space, membership, typeScope } = await requireSpaceTeam(spaceSlug);
  // Either capability opens the page (the navigation shows it for both); each section checks its own.
  if (!(["integrations.manage", "printers.manage"] as const).some((capability) => can(membership.role, capability) && spaceAllows(space.status, capability))) redirect(`/dashboard/${spaceSlug}`);
  const canManage = can(membership.role, "integrations.manage") && spaceAllows(space.status, "integrations.manage");
  const [profile, keys, endpoints, printers] = await Promise.all([
    prisma.space.findUniqueOrThrow({ where: { id: space.id }, select: { logoUrl: true, timezone: true } }),
    canManage ? prisma.apiKey.findMany({ where: { spaceId: space.id }, orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 100,
      select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true } }) : [],
    canManage ? prisma.webhookEndpoint.findMany({ where: { spaceId: space.id }, orderBy: { createdAt: "asc" },
      select: { id: true, url: true, description: true, events: true, isActive: true, consecutiveFailures: true, disabledAt: true,
        deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true } } } }) : [],
    prisma.printerConnection.count({ where: { spaceId: space.id, enabled: true, ...machineTypeWhere(typeScope) } }),
  ]);
  const now = Date.now();
  return { space: { ...space, ...profile }, canManage, canPrinters: can(membership.role, "printers.manage"), printers,
    keys: keys.map((key) => ({ ...key, state: key.revokedAt ? "Revoked" : key.expiresAt && key.expiresAt.getTime() <= now ? "Expired" : "Active",
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null, expiresAt: key.expiresAt?.toISOString() ?? null, createdAt: key.createdAt.toISOString(), revokedAt: undefined })),
    endpoints: endpoints.map(({ deliveries, ...endpoint }) => ({ ...endpoint, host: new URL(endpoint.url).host, disabledAt: endpoint.disabledAt?.toISOString() ?? null,
      last: deliveries[0] ? { status: deliveries[0].status, at: deliveries[0].createdAt.toISOString() } : null })),
  };
}
