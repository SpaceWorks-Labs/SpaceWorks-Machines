import "server-only";
import type { Job, MeteringUnit, Prisma } from "@prisma/client";
import { reconcile } from "@/lib/consumables/reservations";
import { fromMilli, toMilli } from "@/lib/consumables/math";
import { changeMachineStatus } from "@/lib/machines/machines";
import { recordUsage } from "@/lib/usage/record";
import { JobGuardError, nonNegativeInteger, requireReason } from "./context";
import { finalPrice } from "./prices";
import type { JobCommand } from "./commands";

export async function prepareFinish(tx: Prisma.TransactionClient, job: Job, actorId: string,
  command: Extract<JobCommand, { kind: "complete" | "fail" }>) {
  if (!job.assignedMachineId) throw new JobGuardError("The job has no running machine.");
  nonNegativeInteger(command.actualMinutes);
  const failed = command.kind === "fail";
  if (failed) { requireReason(command.reason); nonNegativeInteger(command.percent); if (command.percent > 100) throw new JobGuardError("Percent must be between 0 and 100."); }
  const actualQuantity = command.actualQuantity ?? (failed
    ? fromMilli((toMilli(job.reservedQuantity) * BigInt(command.percent) + BigInt(50)) / BigInt(100)) : job.reservedQuantity.toString());
  if (toMilli(actualQuantity) < BigInt(0)) throw new JobGuardError("Actual quantity cannot be negative.");
  const type = await tx.machineType.findUniqueOrThrow({ where: { spaceId_id: { spaceId: job.spaceId, id: job.typeId } } });
  const run = job.runSnapshot as { consumableUnit?: MeteringUnit | null; meteringUnit?: MeteringUnit } | null;
  const now = new Date();
  // All machine locks and usage writes happen before taking the pool lock.
  const usage = await recordUsage(tx, { spaceId: job.spaceId, machineId: job.assignedMachineId, source: "JOB", jobId: job.id,
    actorId, minutes: command.actualMinutes, quantity: actualQuantity, unit: run?.consumableUnit ?? run?.meteringUnit ?? type.consumableUnit ?? type.meteringUnit,
    poolId: job.poolId ?? undefined, succeeded: !failed, percentComplete: failed ? command.percent : 100,
    startedAt: job.startedAt ?? undefined, endedAt: now });
  const machine = await changeMachineStatus(tx, { spaceId: job.spaceId, machineId: job.assignedMachineId, actorId, status: "IDLE", note: failed ? "Job failed" : "Job completed" });
  const reconciliation = job.poolId ? await reconcile(tx, { spaceId: job.spaceId, poolId: job.poolId, jobId: job.id,
    reserved: job.reservedQuantity, actual: actualQuantity, actorId }) : null;
  const price = finalPrice(job, command.actualMinutes, actualQuantity);
  return { data: { actualMinutes: command.actualMinutes, actualQuantity, ...price,
    ...(failed ? { failedAt: now, failPercent: command.percent, statusReason: command.reason.trim() } : { completedAt: now, completedById: actorId }) },
    eventData: { shortfall: reconciliation?.shortfall ?? "0" },
    webhookDeliveryIds: [...usage.webhookDeliveryIds, ...machine.webhookDeliveryIds, ...(reconciliation?.webhookDeliveryIds ?? [])] };
}
