import "server-only";
import type { FinanceEntry } from "@prisma/client";
import { prisma } from "@/lib/db";
import { financeSummary, type LedgerRow } from "./summary";

export const FINANCE_ENTRY_LIMIT = 500;

/** Where an entry came from, as a dashboard link (null for manual entries). */
async function sourceLinks(spaceSlug: string, spaceId: string, entries: FinanceEntry[]) {
  const ids = (type: string) => entries.filter((entry) => entry.sourceType === type).map((entry) => entry.sourceId);
  const [payments, refunds, payouts, logs] = await Promise.all([
    prisma.payment.findMany({ where: { spaceId, id: { in: ids("Payment") } }, select: { id: true, job: { select: { number: true } } } }),
    prisma.refund.findMany({ where: { spaceId, id: { in: ids("Refund") } }, select: { id: true, payment: { select: { job: { select: { number: true } } } } } }),
    prisma.repairPayout.findMany({ where: { spaceId, id: { in: ids("RepairPayout") } }, select: { id: true, fault: { select: { number: true } } } }),
    prisma.maintenanceLog.findMany({ where: { spaceId, id: { in: ids("MaintenanceLog") } }, select: { id: true, machine: { select: { slug: true } } } }),
  ]);
  const base = `/dashboard/${spaceSlug}`;
  const links = new Map<string, string>();
  for (const row of payments) links.set(`Payment:${row.id}`, `${base}/jobs/${row.job.number}`);
  for (const row of refunds) links.set(`Refund:${row.id}`, `${base}/jobs/${row.payment.job.number}`);
  for (const row of payouts) links.set(`RepairPayout:${row.id}`, `${base}/maintenance/faults/${row.fault.number}`);
  for (const row of logs) links.set(`MaintenanceLog:${row.id}`, `${base}/machines/${row.machine.slug}/upkeep`);
  for (const id of ids("ToBuyItem")) links.set(`ToBuyItem:${id}`, `${base}/to-buy`);
  return links;
}

/** The ledger for [from, to): summary maths over every entry, plus the newest entries with links to their source. */
export async function loadFinance(space: { id: string; slug: string }, from: Date, to: Date) {
  const where = { spaceId: space.id, occurredAt: { gte: from, lt: to } };
  const [entries, machines, technicians] = await Promise.all([
    prisma.financeEntry.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }] }),
    prisma.machine.findMany({ where: { spaceId: space.id }, select: { id: true, name: true } }),
    prisma.technician.findMany({ where: { spaceId: space.id }, select: { id: true, name: true } }),
  ]);
  const machineName = new Map(machines.map((row) => [row.id, row.name]));
  const technicianName = new Map(technicians.map((row) => [row.id, row.name]));
  const rows: LedgerRow[] = entries.map((entry) => ({ direction: entry.direction, category: entry.category, amountMinor: entry.amountMinor, currency: entry.currency,
    method: entry.method, machine: entry.machineId ? machineName.get(entry.machineId) ?? "Removed machine" : null,
    technician: entry.technicianId ? technicianName.get(entry.technicianId) ?? "Removed technician" : null, supplier: entry.supplier }));
  const shown = entries.slice(0, FINANCE_ENTRY_LIMIT);
  const links = await sourceLinks(space.slug, space.id, shown);
  return {
    summary: financeSummary(rows),
    count: entries.length,
    entries: shown.map((entry, index) => ({ id: entry.id, occurredAt: entry.occurredAt.toISOString(), direction: entry.direction, category: entry.category,
      amountMinor: entry.amountMinor, currency: entry.currency, method: entry.method, reference: entry.reference, note: entry.note,
      machine: rows[index]!.machine, technician: rows[index]!.technician, supplier: entry.supplier, sourceType: entry.sourceType,
      href: links.get(`${entry.sourceType}:${entry.sourceId}`) ?? null, reversible: entry.category !== "REVERSAL" })),
  };
}

export type FinanceView = Awaited<ReturnType<typeof loadFinance>>;
