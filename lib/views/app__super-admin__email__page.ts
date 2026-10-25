import { requireSuperAdmin } from "@/lib/permissions";
import { OutboxStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { loadDailyEmail } from "@/lib/superAdminData";
import { EMAIL_SERIES } from "@/lib/superAdminSeries";
import { fillDailySeries, outboxByKind, windowStart } from "@/lib/superAdminInsights";
const WINDOW_DAYS = 14;
const STUCK_AFTER_MS = 15 * 60_000;



export async function loadSuperAdminEmailView() {
  await requireSuperAdmin();
  const now = new Date();
  const since = windowStart(WINDOW_DAYS, now);
  const [kindGroups, dailyRows, stuckPending, stuckProcessing] = await Promise.all([
    prisma.outboxMessage.groupBy({ by: ["kind", "status"], _count: { _all: true } }),
    loadDailyEmail(since),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PENDING, availableAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
    prisma.outboxMessage.count({ where: { status: OutboxStatus.PROCESSING, lockedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } } }),
  ]);
  const kinds = outboxByKind(kindGroups.map((group) => ({ kind: group.kind, status: group.status, count: group._count._all })));
  const daily = fillDailySeries(dailyRows, EMAIL_SERIES, WINDOW_DAYS, now);
  const totals = kinds.reduce((sum, row) => ({ pending: sum.pending + row.pending, failed: sum.failed + row.failed, sent: sum.sent + row.sent, total: sum.total + row.total }), { pending: 0, failed: 0, sent: 0, total: 0 });
  return { totals, stuckPending, stuckProcessing, daily, kinds };
}
