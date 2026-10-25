import "server-only";
import { prisma } from "@/lib/db";

/**
 * Every money source has exactly one ledger entry with the same amount: paid payments, succeeded refunds,
 * repair payouts, maintenance records with a cost and bought to-buy items. Returns the mismatches (empty when
 * the ledger agrees with its sources). Used by the integration tests.
 */
export async function financeMismatches(spaceId: string) {
  const [payments, refunds, payouts, logs, bought, entries] = await Promise.all([
    prisma.payment.findMany({ where: { spaceId, status: "PAID", amount: { gt: 0 } }, select: { id: true, amount: true } }),
    prisma.refund.findMany({ where: { spaceId, status: "SUCCEEDED", amount: { gt: 0 } }, select: { id: true, amount: true } }),
    prisma.repairPayout.findMany({ where: { spaceId }, select: { id: true, amount: true } }),
    prisma.maintenanceLog.findMany({ where: { spaceId, cost: { gt: 0 } }, select: { id: true, cost: true } }),
    prisma.toBuyItem.findMany({ where: { spaceId, status: { in: ["BOUGHT", "RECEIVED"] }, amount: { gt: 0 } }, select: { id: true, amount: true } }),
    prisma.financeEntry.findMany({ where: { spaceId, sourceType: { in: ["Payment", "Refund", "RepairPayout", "MaintenanceLog", "ToBuyItem"] } },
      select: { sourceType: true, sourceId: true, amountMinor: true } }),
  ]);
  const posted = new Map(entries.map((entry) => [`${entry.sourceType}:${entry.sourceId}`, entry.amountMinor]));
  const expected: Array<[string, string, number]> = [
    ...payments.map((row) => ["Payment", row.id, row.amount] as [string, string, number]),
    ...refunds.map((row) => ["Refund", row.id, row.amount] as [string, string, number]),
    ...payouts.map((row) => ["RepairPayout", row.id, row.amount] as [string, string, number]),
    ...logs.map((row) => ["MaintenanceLog", row.id, row.cost!] as [string, string, number]),
    ...bought.map((row) => ["ToBuyItem", row.id, row.amount!] as [string, string, number]),
  ];
  const mismatches: Array<{ sourceType: string; sourceId: string; expected: number; posted: number | null }> = [];
  const seen = new Set<string>();
  for (const [sourceType, sourceId, amount] of expected) {
    const key = `${sourceType}:${sourceId}`;
    seen.add(key);
    if (posted.get(key) !== amount) mismatches.push({ sourceType, sourceId, expected: amount, posted: posted.get(key) ?? null });
  }
  for (const [key, amount] of posted) {
    if (!seen.has(key)) {
      const [sourceType, sourceId] = key.split(":") as [string, string];
      mismatches.push({ sourceType, sourceId, expected: 0, posted: amount });
    }
  }
  return mismatches;
}
