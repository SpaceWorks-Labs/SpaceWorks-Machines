import "server-only";

import { prisma } from "@/lib/db";
import type { DailyRow } from "@/lib/superAdminInsights";

/** Per-day outbox volume since `since`, grouped in the database. Counts only; no rows or recipients are read. */
export function loadDailyEmail(since: Date) {
  return prisma.$queryRaw<DailyRow[]>`
    select 'queued' as series, to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, count(*)::int as n from "OutboxMessage" where "createdAt" >= ${since} group by 2
    union all
    select 'sent', to_char(date_trunc('day', "sentAt"), 'YYYY-MM-DD'), count(*)::int from "OutboxMessage" where "status" = 'SENT' and "sentAt" >= ${since} group by 2
    union all
    select 'failed', to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD'), count(*)::int from "OutboxMessage" where "status" = 'FAILED' and "createdAt" >= ${since} group by 2
  `;
}
