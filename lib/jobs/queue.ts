import type { JobStatus } from "@prisma/client";

export type QueueJob = { id: string; spaceId: string; typeId: string; machineId: string | null;
  assignedMachineId?: string | null; status: JobStatus; priority: number; submittedAt: Date;
  estimatedMinutes: number | null; startedAt?: Date | null };

/** The caller supplies active (non-retired, usable) machines, scoped again here by tenant and type. */
export function queuePosition(job: QueueJob, jobs: readonly QueueJob[], machines: readonly {
  id: string; spaceId: string; typeId: string;
}[], now = new Date()) {
  if (!["SUBMITTED", "APPROVED"].includes(job.status)) return null;
  const scope = jobs.filter((j) => j.spaceId === job.spaceId && j.typeId === job.typeId &&
    (!job.machineId || j.machineId === job.machineId || j.assignedMachineId === job.machineId));
  const waiting = scope.filter((j) => ["SUBMITTED", "APPROVED"].includes(j.status)).sort((a, b) =>
    b.priority - a.priority || Number(b.status === "APPROVED") - Number(a.status === "APPROVED") ||
    a.submittedAt.getTime() - b.submittedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index = waiting.findIndex((j) => j.id === job.id);
  if (index < 0) return null;
  const ahead = waiting.slice(0, index);
  const running = scope.filter((j) => ["RUNNING", "PAUSED"].includes(j.status));
  const count = machines.filter((m) => m.spaceId === job.spaceId && m.typeId === job.typeId).length;
  const minutes = ahead.reduce((sum, j) => sum + (j.estimatedMinutes ?? 0), 0) + running.reduce((sum, j) =>
    sum + Math.max(0, (j.estimatedMinutes ?? 0) - (j.startedAt ? Math.max(0, now.getTime() - j.startedAt.getTime()) / 60000 : 0)), 0);
  return { position: index + 1, approvedAhead: ahead.filter((j) => j.status === "APPROVED").length,
    awaitingReviewAhead: job.status === "SUBMITTED" ? ahead.filter((j) => j.status === "SUBMITTED").length : 0,
    etaMinutes: count ? Math.ceil(minutes / count) : null };
}
