import { auth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { buildAccountDataExport, loadAccountExportSource } from "@/lib/accountDataExport";
import { checkRateLimitById } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function empty(status: number, extra: Record<string, string> = {}) {
  return new Response(null, { status, headers: { ...privateHeaders, ...extra } });
}

/**
 * Personal data export: the signed-in user's own profile and spaces as a JSON download. The user is
 * resolved solely from the session; no request input selects whose data.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return empty(401);

  // Keyed on the user, not the IP: deployments without a trusted proxy header
  // share one "unknown" IP and must not throttle every account together.
  if (!(await checkRateLimitById("dataExport", `user:${userId}`))) {
    return empty(429, { "Retry-After": "3600" });
  }

  const source = await loadAccountExportSource(userId);
  if (!source) return empty(401);

  await recordAuditEvent({
    action: "ACCOUNT_DATA_EXPORTED",
    actorUserId: userId,
    targetType: "User",
    targetId: userId,
  });

  const generatedAt = new Date();
  const stamp = generatedAt.toISOString().slice(0, 10);
  const body = JSON.stringify(buildAccountDataExport(source, generatedAt), null, 2);
  return new Response(body, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="space-works-machines-account-data-${stamp}.json"`,
    },
  });
}
