import { spaceActionAccess } from "@/lib/permissions";
import { csvCell } from "@/lib/jobs/presentation";
import { auditRows } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

/** The filtered audit log as CSV (newest first, at most 10 000 rows). */
export async function GET(request: Request, { params }: { params: Promise<{ spaceSlug: string }> }) {
  const access = await spaceActionAccess((await params).spaceSlug, "audit.view");
  if (!access.ok) return new Response("Not found.", { status: 404 });
  const query = new URL(request.url).searchParams;
  const rows = await auditRows(access.space.id, { actor: query.get("actor") ?? undefined, area: query.get("area") ?? undefined,
    from: query.get("from") ?? undefined, to: query.get("to") ?? undefined }, 10_000, { userId: access.userId, typeScope: access.typeScope });
  const csv = [["When (UTC)", "Who", "Action", "Target", "Details"], ...rows.map((row) => [row.createdAt, row.actor, row.action, row.target, row.detail])]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="audit-log.csv"', "Cache-Control": "private, no-store" } });
}
