import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function loadSuperAdminStorageView() {
  await requireSuperAdmin();
  let dbSizeBytes: number | null = null;
  let tableSizes:
    | Array<{ table_name: string; total_bytes: number; total_pretty: string; }>
    | null = null;
  try {
    const dbRows = await prisma.$queryRaw<Array<{ bytes: bigint; }>>`
      select pg_database_size(current_database()) as bytes
    `;
    dbSizeBytes = dbRows?.[0]?.bytes ? Number(dbRows[0].bytes) : null;

    tableSizes = await prisma.$queryRaw<
      Array<{ table_name: string; total_bytes: bigint; total_pretty: string; }>
    >`
      select
        relname as table_name,
        pg_total_relation_size(quote_ident(relname)) as total_bytes,
        pg_size_pretty(pg_total_relation_size(quote_ident(relname))) as total_pretty
      from pg_stat_user_tables
      order by pg_total_relation_size(quote_ident(relname)) desc
      limit 25
    `.then((rows) =>
      rows.map((r) => ({
        table_name: r.table_name,
        total_bytes: Number(r.total_bytes),
        total_pretty: r.total_pretty,
      })),
    );
  } catch {
    // Some managed Postgres setups restrict these functions. We'll degrade gracefully.
  }
  const perSpaceCounts = await prisma.space.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { members: true } },
    },
  });
  const assetTotals = await prisma.asset
    .groupBy({
      by: ["spaceId"],
      _sum: { byteSize: true },
      where: { spaceId: { not: null }, byteSize: { not: null } },
    })
    .then((rows) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const spaceId = r.spaceId;
        if (!spaceId) continue;
        const bytes = r._sum.byteSize ? Number(r._sum.byteSize) : 0;
        m.set(spaceId, bytes);
      }
      return m;
    })
    .catch(() => new Map<string, number>());
  const [assetSummary, assetsByType, recentAssets] = await Promise.all([
    prisma.asset.aggregate({ _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.asset.groupBy({ by: ["provider", "contentType"], _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.asset.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      // Object keys and URLs stay private; only type, size, and owner are shown.
      select: { id: true, contentType: true, byteSize: true, provider: true, createdAt: true, space: { select: { id: true, name: true } } },
    }),
  ]);
  const sortedTypes = [...assetsByType].sort((a, b) => Number(b._sum.byteSize ?? 0) - Number(a._sum.byteSize ?? 0));
  return { dbSizeBytes, assetSummary, sortedTypes, recentAssets, tableSizes, perSpaceCounts, assetTotals };
}
