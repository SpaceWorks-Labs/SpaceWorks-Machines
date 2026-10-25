import { reliability, type Interval } from "@/lib/upkeep/due";

/** Pure report maths over rows already scoped to one space and date range. Client-safe. */

export type JobRow = { status: string; typeName: string; machineName: string | null; submittedAt: Date; completedAt: Date | null };
export type UsageRow = { machineId: string; minutes: number };
export type MachineRow = { id: string; name: string };
export type DowntimeRow = Interval & { machineId: string };
export type FaultRow = { machineId: string; createdAt: Date };
export type AdjustmentRow = { poolLabel: string; material: string; unit: string; kind: string; delta: number; costPerUnit: number | null };
export type MoneyRow = { currency: string; status: string; method: string | null; typeName: string; machineName: string | null; amount: number };
export type RefundRow = { currency: string; amount: number };
export type LogRow = { machineId: string; cost: number | null };

const FINISHED = new Set(["COMPLETED", "COLLECTED"]);
/** Ledger kinds that move stock for use: job reservations net of reconcile/release, and manual logs. */
const USED = new Set(["RESERVE", "RECONCILE", "RELEASE", "MANUAL"]);

function count<T>(rows: T[], key: (row: T) => string) {
  const out = new Map<string, number>();
  for (const row of rows) out.set(key(row), (out.get(key(row)) ?? 0) + 1);
  return [...out].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

export function jobsReport(rows: JobRow[]) {
  const finished = rows.filter((row) => FINISHED.has(row.status) && row.completedAt);
  const failed = rows.filter((row) => row.status === "FAILED").length;
  const turnaround = finished.map((row) => row.completedAt!.getTime() - row.submittedAt.getTime());
  return {
    total: rows.length,
    byStatus: count(rows, (row) => row.status), byType: count(rows, (row) => row.typeName), byMachine: count(rows, (row) => row.machineName ?? "Unassigned"),
    failureRate: finished.length + failed ? failed / (finished.length + failed) : null,
    turnaroundMinutes: turnaround.length ? Math.round(turnaround.reduce((a, b) => a + b, 0) / turnaround.length / 60_000) : null,
  };
}

export function utilisationReport(machines: MachineRow[], usage: UsageRow[], downtime: DowntimeRow[], faults: FaultRow[], from: Date, to: Date) {
  return machines.map((machine) => {
    const runs = usage.filter((row) => row.machineId === machine.id);
    const stats = reliability(downtime.filter((row) => row.machineId === machine.id), faults.filter((row) => row.machineId === machine.id).length, from, to);
    return { machineId: machine.id, name: machine.name, hoursRun: runs.reduce((sum, row) => sum + row.minutes, 0) / 60, runs: runs.length, ...stats };
  });
}

/** Quantities in thousandths keep decimal stock exact; cost is the pool's cost per unit at report time. */
export function consumablesReport(rows: AdjustmentRow[]) {
  const pools = new Map<string, { label: string; material: string; unit: string; usedMilli: number; costPerUnit: number | null }>();
  for (const row of rows.filter((row) => USED.has(row.kind))) {
    const entry = pools.get(row.poolLabel) ?? { label: row.poolLabel, material: row.material, unit: row.unit, usedMilli: 0, costPerUnit: row.costPerUnit };
    entry.usedMilli -= Math.round(row.delta * 1000);
    pools.set(row.poolLabel, entry);
  }
  return [...pools.values()].map(({ usedMilli, costPerUnit, ...pool }) => ({ ...pool, used: usedMilli / 1000,
    cost: costPerUnit === null ? null : Math.round(usedMilli * costPerUnit / 1000) })).sort((a, b) => b.used - a.used);
}

type Totals = { paid: number; pending: number; waived: number; refunded: number };
/** Never adds across currencies: every figure is per currency. */
export function revenueReport(payments: MoneyRow[], refunds: RefundRow[]) {
  const byCurrency = new Map<string, Totals>();
  const totals = (currency: string) => byCurrency.get(currency) ?? byCurrency.set(currency, { paid: 0, pending: 0, waived: 0, refunded: 0 }).get(currency)!;
  for (const row of payments) {
    const entry = totals(row.currency);
    if (row.status === "PAID") entry.paid += row.amount;
    else if (row.status === "PENDING") entry.pending += row.amount;
    else if (row.status === "WAIVED") entry.waived += row.amount;
  }
  for (const row of refunds) totals(row.currency).refunded += row.amount;
  const group = (key: (row: MoneyRow) => string) => {
    const out = new Map<string, number>();
    for (const row of payments.filter((row) => row.status === "PAID")) out.set(`${key(row)}\u0000${row.currency}`, (out.get(`${key(row)}\u0000${row.currency}`) ?? 0) + row.amount);
    return [...out].map(([k, amount]) => { const [label, currency] = k.split("\u0000"); return { label: label!, currency: currency!, amount }; })
      .sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount);
  };
  return { currencies: [...byCurrency].map(([currency, value]) => ({ currency, ...value })),
    byMethod: group((row) => row.method ?? "Other"), byType: group((row) => row.typeName), byMachine: group((row) => row.machineName ?? "Unassigned") };
}

/** Fleet MTBF = total up time across machines ÷ faults; MTTR = mean fault-linked repair time. */
export function maintenanceReport(utilisation: ReturnType<typeof utilisationReport>, logs: LogRow[], overdue: number, downtime: DowntimeRow[], faults: FaultRow[], from: Date, to: Date) {
  const costed = logs.filter((row) => row.cost != null);
  const period = Math.max(0, to.getTime() - from.getTime()) / 60_000;
  const uptime = utilisation.reduce((sum, row) => sum + period - row.downtimeMinutes, 0);
  return { logs: logs.length, cost: costed.length ? costed.reduce((sum, row) => sum + row.cost!, 0) : null, overdue, faults: faults.length,
    mtbfMinutes: faults.length ? Math.round(uptime / faults.length) : null, mttrMinutes: reliability(downtime, 0, from, to).mttrMinutes };
}
