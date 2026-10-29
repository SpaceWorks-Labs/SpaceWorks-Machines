import "server-only";
import { prisma } from "@/lib/db";
import { faultNumber } from "@/lib/upkeep/labels";
import { calendarDayAt } from "@/lib/calendarDay";

/**
 * What each machine cost to keep running over [from, to), from the finance ledger: repair payouts, maintenance,
 * parts and consumables bought for it, net of reversals, per currency. Machine manager only (money).
 */
const SPEND = ["REPAIR_PAYOUT", "MAINTENANCE", "PARTS", "CONSUMABLES"] as const;
type SpendKey = (typeof SPEND)[number];

export async function loadSpendReports(spaceId: string, from: Date, to: Date, timezone = "UTC") {
  const [entries, machines, payouts] = await Promise.all([
    prisma.financeEntry.findMany({ where: { spaceId, occurredAt: { gte: from, lt: to }, machineId: { not: null },
      OR: [{ category: { in: [...SPEND] } }, { category: "REVERSAL" }] }, select: { id: true, category: true, direction: true, amountMinor: true, currency: true, machineId: true, reversesId: true } }),
    prisma.machine.findMany({ where: { spaceId }, select: { id: true, name: true } }),
    prisma.repairPayout.findMany({ where: { spaceId, paidAt: { gte: from, lt: to } }, orderBy: { paidAt: "asc" },
      include: { technician: { select: { name: true } }, fault: { select: { number: true, title: true, approvedAmount: true, machine: { select: { name: true } } } } } }),
  ]);
  const reversed = new Map((await prisma.financeEntry.findMany({ where: { spaceId, id: { in: entries.flatMap((entry) => entry.reversesId ? [entry.reversesId] : []) } },
    select: { id: true, category: true } })).map((row) => [row.id, row.category]));
  const name = new Map(machines.map((machine) => [machine.id, machine.name]));
  const rows = new Map<string, { machine: string; currency: string } & Record<SpendKey | "total", number>>();
  for (const entry of entries) {
    const category = (entry.category === "REVERSAL" ? reversed.get(entry.reversesId ?? "") : entry.category) as SpendKey | undefined;
    if (!category || !SPEND.includes(category)) continue;
    const key = `${entry.machineId}\u0000${entry.currency}`;
    const row = rows.get(key) ?? { machine: name.get(entry.machineId!) ?? "Removed machine", currency: entry.currency, REPAIR_PAYOUT: 0, MAINTENANCE: 0, PARTS: 0, CONSUMABLES: 0, total: 0 };
    const amount = entry.direction === "OUT" ? entry.amountMinor : -entry.amountMinor;
    row[category] += amount;
    row.total += amount;
    rows.set(key, row);
  }
  return {
    spend: [...rows.values()].sort((a, b) => b.total - a.total || a.machine.localeCompare(b.machine)).map((row) => ({ machine: row.machine, currency: row.currency,
      repairs: row.REPAIR_PAYOUT, maintenance: row.MAINTENANCE, parts: row.PARTS, consumables: row.CONSUMABLES, total: row.total })),
    repairs: payouts.map((row) => ({ month: calendarDayAt(row.paidAt, timezone).slice(0, 7), paidOn: calendarDayAt(row.paidAt, timezone), fault: `${faultNumber(row.fault.number)} ${row.fault.title}`,
      machine: row.fault.machine.name, technician: row.technician.name, method: row.method, reference: row.reference, amount: row.amount, currency: row.currency })),
  };
}

export type SpendReports = Awaited<ReturnType<typeof loadSpendReports>>;
