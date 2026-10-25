import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getApiMonitorSnapshot } from "@/lib/apiMonitor";

export async function loadSuperAdminMonitoringView() {
  await requireSuperAdmin();
  const snapshot = getApiMonitorSnapshot();
  let dbOk = true;
  let dbName: string | null = null;
  try {
    const rows = await prisma.$queryRaw<Array<{ db: string; }>>`
      select current_database() as db
    `;
    dbName = rows?.[0]?.db ?? null;
  } catch {
    dbOk = false;
  }
  const configuredSuperAdmin = !!process.env.SUPER_ADMIN_EMAIL;
  const configuredAuthSecret = !!process.env.AUTH_SECRET;
  const configuredDbUrl = !!process.env.DATABASE_URL;
  return { dbName, dbOk, configuredDbUrl, configuredAuthSecret, configuredSuperAdmin, snapshot };
}
