import "server-only";
import type { Job, Prisma } from "@prisma/client";
import { reserve } from "@/lib/consumables/reservations";
import { lockPool } from "@/lib/consumables/ledger";
import { toMilli } from "@/lib/consumables/math";
import { changeMachineStatus } from "@/lib/machines/machines";
import { readFields } from "@/lib/machines/fields";
import { JobGuardError, JobNotFoundError, lockJobMachine, lockTypeCapacity } from "./context";
import type { JobCommand } from "./commands";

/** Caller has locked the job. Capacity lock precedes machine, which precedes the pool. */
export async function prepareStart(tx: Prisma.TransactionClient, job: Job, actorId: string,
  command: Extract<JobCommand, { kind: "start" }>) {
  await lockTypeCapacity(tx, job.spaceId, job.typeId);
  const type = await tx.machineType.findFirst({ where: { spaceId: job.spaceId, id: job.typeId } });
  if (!type || type.archivedAt || !type.acceptsJobs) throw new JobGuardError("This machine type is not accepting jobs.");
  const count = await tx.job.count({ where: { spaceId: job.spaceId, typeId: type.id, status: "RUNNING" } });
  if (type.maxConcurrentJobs != null && count >= type.maxConcurrentJobs) throw new JobGuardError("This type is at its concurrent job limit.");
  let machineId = command.machineId ?? job.assignedMachineId ?? job.machineId;
  if (!machineId && type.allocationPolicy === "FIRST_IDLE") {
    // SKIP LOCKED permits independent types/manual usage to hold another machine without blocking allocation.
    const idle = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Machine"
      WHERE "spaceId" = ${job.spaceId} AND "typeId" = ${type.id} AND "retiredAt" IS NULL
        AND "acceptsJobs" = true AND "status" = 'IDLE' ORDER BY "createdAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    machineId = idle[0]?.id;
  }
  if (!machineId) throw new JobGuardError("Choose an idle machine to start this job.");
  const machine = await lockJobMachine(tx, job.spaceId, machineId);
  if (machine.typeId !== type.id) throw new JobNotFoundError();
  if (machine.retiredAt || !machine.acceptsJobs ||
    (machine.status !== "IDLE" && !(machine.status === "RESERVED" && job.assignedMachineId === machine.id))) {
    throw new JobGuardError("This machine is not available for this job.");
  }
  if (await tx.job.findFirst({ where: { spaceId: job.spaceId, assignedMachineId: machine.id, status: { in: ["RUNNING", "PAUSED"] } } })) {
    throw new JobGuardError("This machine already has an active job.");
  }
  const webhookDeliveryIds = (await changeMachineStatus(tx, { spaceId: job.spaceId, machineId: machine.id, actorId, status: "RUNNING", note: "Job started" })).webhookDeliveryIds;
  const quantity = command.plannedQuantity ?? job.estimatedQuantity?.toString() ?? "0";
  if (toMilli(quantity) < BigInt(0)) throw new JobGuardError("Planned quantity cannot be negative.");
  let poolId: string | null = null;
  let reservedQuantity = "0";
  let poolLabel: string | null = null;
  if (type.consumableUnit && toMilli(quantity) > BigInt(0)) {
    if (!command.poolId) throw new JobGuardError("Choose a consumable pool for the planned quantity.");
    const pool = await lockPool(tx, job.spaceId, command.poolId);
    if (pool.unit !== type.consumableUnit) throw new JobGuardError("The pool uses a different consumable unit.");
    const request = job.requestData as Record<string, unknown>;
    for (const field of readFields(type.requestFields).filter((f) => ["material", "colour"].includes(f.kind))) {
      const wanted = request[field.key];
      if (typeof wanted === "string" && wanted.trim() && wanted.toLowerCase() !== "no preference" &&
        wanted.toLowerCase() !== pool[field.kind as "material" | "colour"].toLowerCase()) throw new JobGuardError("The pool does not match the requested material or colour.");
    }
    const reservation = await reserve(tx, { spaceId: job.spaceId, poolId: pool.id, jobId: job.id, quantity, actorId, machine });
    webhookDeliveryIds.push(...reservation.webhookDeliveryIds);
    poolId = pool.id; reservedQuantity = quantity; poolLabel = [pool.material, pool.colour].filter(Boolean).join(" ");
  } else if (command.poolId) throw new JobGuardError("A pool requires a consumable type and a positive planned quantity.");
  return { data: { assignedMachineId: machine.id, poolId, reservedQuantity, startedAt: new Date(), startedById: actorId,
    runSnapshot: { machineId: machine.id, machineName: machine.name, machineModel: machine.model, poolLabel,
      consumableUnit: type.consumableUnit, meteringUnit: type.meteringUnit,
      estimatedMinutes: job.estimatedMinutes, estimatedQuantity: job.estimatedQuantity?.toString() ?? null, plannedQuantity: quantity } }, webhookDeliveryIds };
}
