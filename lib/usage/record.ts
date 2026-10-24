import "server-only";
import type { MeteringUnit, Prisma, UsageSource } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { applyAdjustment, lockPool } from "@/lib/consumables/ledger";
import { fromMilli, poolServesMachine, toMilli } from "@/lib/consumables/math";
import { jobAccess, JobGuardError, JobNotFoundError, lockJob, lockJobMachine, nonNegativeInteger } from "@/lib/jobs/context";
import { actorMayUseType } from "@/lib/typeScope";

export type UsageInput = { spaceId: string; machineId: string; source: UsageSource; actorId?: string | null;
  jobId?: string; minutes: number; succeeded: boolean; percentComplete?: number; quantity?: string;
  unit?: MeteringUnit; poolId?: string; note?: string; startedAt?: Date; endedAt?: Date };

/**
 * The only writer of usage and machine meters. Caller owns the transaction. JOB takes job -> machine;
 * manual and adapter take machine -> pool. JOB pool quantities have already been reserved by the job service.
 * ADAPTER is a trusted ingestion API for one run outside the job queue. Aggregate telemetry into one run,
 * rather than recording every polling snapshot: every usage row contributes one job to the machine meter.
 */
export async function recordUsage(tx: Prisma.TransactionClient, input: UsageInput) {
  nonNegativeInteger(input.minutes);
  const percent = nonNegativeInteger(input.percentComplete ?? (input.succeeded ? 100 : 0));
  if (percent > 100) throw new JobGuardError("Percent complete must be between 0 and 100.");
  if (input.quantity != null && toMilli(input.quantity) < BigInt(0)) throw new JobGuardError("Quantity cannot be negative.");
  if (input.startedAt && input.endedAt && input.endedAt < input.startedAt) throw new JobGuardError("Usage cannot end before it starts.");
  if (input.source === "MANUAL") {
    if (!input.actorId) throw new JobGuardError("A manual log needs an operator.");
    await jobAccess(tx, input.spaceId, input.actorId, "jobs.operate");
  }
  if (input.jobId) {
    const job = await lockJob(tx, input.spaceId, input.jobId);
    if (input.source !== "JOB" || job.assignedMachineId !== input.machineId ||
      (input.poolId != null && input.poolId !== job.poolId) || !["RUNNING", "PAUSED"].includes(job.status)) {
      throw new JobGuardError("Usage must belong to the running job's machine.");
    }
    if (await tx.usageLog.findFirst({ where: { spaceId: input.spaceId, jobId: job.id, source: "JOB" } })) throw new JobGuardError("Job usage was already recorded.");
  } else if (input.source === "JOB") throw new JobGuardError("Job usage needs a job.");
  const machine = await lockJobMachine(tx, input.spaceId, input.machineId);
  if (input.source === "MANUAL" && !(await actorMayUseType(tx, input.spaceId, input.actorId, machine.typeId))) throw new JobNotFoundError();
  if (input.poolId && input.source === "ADAPTER") throw new JobGuardError("Adapter usage cannot take pool stock.");
  if (input.poolId && input.source === "MANUAL") {
    const pool = await lockPool(tx, input.spaceId, input.poolId);
    if (!pool.isActive || !poolServesMachine(pool, machine) || pool.unit !== input.unit || input.quantity == null) {
      throw new JobGuardError("Choose an active pool serving this machine with the same quantity unit.");
    }
  }
  const log = await tx.usageLog.create({ data: { spaceId: input.spaceId, machineId: machine.id, source: input.source,
    jobId: input.jobId, minutes: input.minutes, quantity: input.quantity, unit: input.unit, poolId: input.poolId,
    succeeded: input.succeeded, percentComplete: percent, note: (input.note ?? "").slice(0, 2000),
    startedAt: input.startedAt, endedAt: input.endedAt, loggedById: input.actorId } });
  await tx.machine.update({ where: { spaceId_id: { spaceId: input.spaceId, id: machine.id } },
    data: { meterMinutes: { increment: input.minutes }, meterJobs: { increment: 1 } } });
  const adjustment = input.source === "MANUAL" && input.poolId && toMilli(input.quantity!) > BigInt(0)
    ? await applyAdjustment(tx, { spaceId: input.spaceId, poolId: input.poolId, kind: "MANUAL",
      delta: fromMilli(-toMilli(input.quantity!)), usageLogId: log.id, actorId: input.actorId, reason: "Manual usage" }) : null;
  await recordAuditEvent({ action: "usage.recorded", actorUserId: input.actorId, spaceId: input.spaceId,
    targetType: "UsageLog", targetId: log.id, metadata: { source: input.source, minutes: input.minutes, succeeded: input.succeeded }, client: tx });
  return { log, webhookDeliveryIds: adjustment?.webhookDeliveryIds ?? [] };
}
