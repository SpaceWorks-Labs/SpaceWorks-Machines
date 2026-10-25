import "server-only";
import { prisma } from "@/lib/db";
import type { JobDependencies } from "@/lib/jobs/transitions";
import { runPrinterCommand } from "./connections";

/**
 * The job lifecycle's printer hook: when a job starts on a machine with an enabled connection, ask the printer
 * to start too (best effort; transitionJob turns a failure into a warning, never a rollback).
 */
export const printerDependencies: JobDependencies = {
  async startPrinter({ spaceId, jobId, machineId }) {
    const [connection, job] = await Promise.all([
      prisma.printerConnection.findFirst({ where: { spaceId, machineId, enabled: true }, select: { id: true, adapter: true } }),
      prisma.job.findFirst({ where: { spaceId, id: jobId }, select: { number: true, title: true, estimatedMinutes: true, startedById: true } }),
    ]);
    if (!connection || !job || connection.adapter === "MANUAL") return;
    const result = await runPrinterCommand(spaceId, connection.id, "start", job.startedById, { jobId,
      name: `J-${String(job.number).padStart(4, "0")} ${job.title}`.slice(0, 120), estimatedSeconds: (job.estimatedMinutes ?? 20) * 60 });
    if (!result.ok) throw new Error(result.message);
  },
};
