import "server-only";
import { prisma } from "@/lib/db";

export type HistoryEntry = { at: string; kind: "maintenance" | "downtime" | "fault" | "status" | "warranty" | "usage"; title: string; detail: string };

const HOURS_MILESTONE = 100;
const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

/** Usage milestones: the moments the machine's hour meter crossed each 100-hour mark. */
function milestones(rows: { minutes: number; createdAt: Date }[]) {
  const out: HistoryEntry[] = [];
  let total = 0;
  for (const row of rows) {
    const before = Math.floor(total / 60 / HOURS_MILESTONE);
    total += row.minutes;
    const after = Math.floor(total / 60 / HOURS_MILESTONE);
    for (let mark = before + 1; mark <= after; mark += 1) out.push({ at: row.createdAt.toISOString(), kind: "usage", title: `${mark * HOURS_MILESTONE} machine hours`, detail: "" });
  }
  return out;
}

/** One machine's timeline, newest first: maintenance, downtime, faults, status changes, warranty and usage milestones. */
export async function serviceHistory(spaceId: string, machineId: string, limit = 200) {
  const [logs, downtime, faults, statuses, warranty, usage] = await Promise.all([
    prisma.maintenanceLog.findMany({ where: { spaceId, machineId }, orderBy: { performedAt: "desc" }, take: limit, select: { performedAt: true, kind: true, summary: true, cost: true } }),
    prisma.downtime.findMany({ where: { spaceId, machineId }, orderBy: { startedAt: "desc" }, take: limit, select: { startedAt: true, endedAt: true, reason: true, note: true } }),
    prisma.faultReport.findMany({ where: { spaceId, machineId }, orderBy: { createdAt: "desc" }, take: limit, select: { number: true, title: true, severity: true, createdAt: true, resolvedAt: true, status: true } }),
    prisma.auditEvent.findMany({ where: { spaceId, targetType: "Machine", targetId: machineId, action: { in: ["machine.status_changed", "machine.retired", "machine.unretired"] } },
      orderBy: { createdAt: "desc" }, take: limit, select: { action: true, createdAt: true, metadata: true } }),
    prisma.warranty.findFirst({ where: { spaceId, machineId }, select: { startsOn: true, expiresOn: true, vendorName: true } }),
    prisma.usageLog.findMany({ where: { spaceId, machineId }, orderBy: { createdAt: "asc" }, select: { minutes: true, createdAt: true } }),
  ]);
  const fault = (n: number) => `F-${String(n).padStart(4, "0")}`;
  const entries: HistoryEntry[] = [
    ...logs.map((log) => ({ at: log.performedAt.toISOString(), kind: "maintenance" as const, title: log.summary, detail: label(log.kind) })),
    ...downtime.flatMap((row) => [{ at: row.startedAt.toISOString(), kind: "downtime" as const, title: "Downtime started", detail: [label(row.reason), row.note].filter(Boolean).join(": ") },
      ...(row.endedAt ? [{ at: row.endedAt.toISOString(), kind: "downtime" as const, title: "Downtime ended", detail: label(row.reason) }] : [])]),
    ...faults.flatMap((row) => [{ at: row.createdAt.toISOString(), kind: "fault" as const, title: `${fault(row.number)} reported`, detail: `${label(row.severity)}: ${row.title}` },
      ...(row.resolvedAt ? [{ at: row.resolvedAt.toISOString(), kind: "fault" as const, title: `${fault(row.number)} ${row.status === "WONT_FIX" ? "closed" : "resolved"}`, detail: row.title }] : [])]),
    ...statuses.map((row) => {
      const meta = (row.metadata ?? {}) as { from?: string; to?: string };
      return { at: row.createdAt.toISOString(), kind: "status" as const,
        title: row.action === "machine.status_changed" ? `Status: ${label(meta.to ?? "")}` : row.action === "machine.retired" ? "Retired" : "Back in service",
        detail: meta.from ? `From ${label(meta.from)}` : "" };
    }),
    ...(warranty?.startsOn ? [{ at: warranty.startsOn.toISOString(), kind: "warranty" as const, title: "Warranty starts", detail: warranty.vendorName }] : []),
    ...(warranty?.expiresOn && warranty.expiresOn.getTime() <= Date.now() ? [{ at: warranty.expiresOn.toISOString(), kind: "warranty" as const, title: "Warranty expired", detail: warranty.vendorName }] : []),
    ...milestones(usage),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
