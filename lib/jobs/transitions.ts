import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Job, Prisma, SpaceJobSettings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissionRoles";
import { release } from "@/lib/consumables/reservations";
import { toMilli } from "@/lib/consumables/math";
import { changeMachineStatus } from "@/lib/machines/machines";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { actorMayUseType } from "@/lib/typeScope";
import { jobAccess, JobGuardError, JobNotFoundError, jobSettings, lockJob, lockJobMachine, lockTypeCapacity,
  nextJobNumber, nonNegativeInteger, requireReason, type JobContext } from "./context";
import type { JobCommand } from "./commands";
import { jobEvent } from "./events";
import { quoteJob } from "./prices";
import { prepareStart } from "./start";
import { prepareFinish } from "./finish";
import type { JobPaymentEffects } from "./paymentEffects";
import { jobPaymentEffects } from "@/lib/payments/jobs/effects";

export type JobDependencies = { payments?: JobPaymentEffects;
  /** Phase 5 supplies the adapter. Called after commit; failures become warnings, never roll back SQL. */
  startPrinter?: (input: { spaceId: string; jobId: string; machineId: string }) => Promise<void> };
const events = { approve: "approved", reject: "rejected", cancel: "cancelled", start: "started", pause: "paused",
  resume: "resumed", complete: "completed", fail: "failed", collect: "collected", reprint: "reprinted",
  priority: "priority_changed", reassign: "reassigned", note: "noted" } as const;
const allowed: Record<JobCommand["kind"], Job["status"][]> = {
  approve: ["SUBMITTED"], reject: ["SUBMITTED", "APPROVED"], cancel: ["SUBMITTED", "APPROVED", "PAUSED"],
  start: ["APPROVED"], pause: ["RUNNING"], resume: ["PAUSED"], complete: ["RUNNING", "PAUSED"],
  fail: ["RUNNING", "PAUSED"], collect: ["COMPLETED"], reprint: ["FAILED", "COMPLETED", "COLLECTED"],
  priority: ["SUBMITTED", "APPROVED"], reassign: ["SUBMITTED", "APPROVED"],
  note: ["SUBMITTED", "APPROVED", "RUNNING", "PAUSED", "COMPLETED", "COLLECTED", "REJECTED", "FAILED", "CANCELLED"],
};
const statusFor = { approve: "APPROVED", reject: "REJECTED", cancel: "CANCELLED", start: "RUNNING", pause: "PAUSED",
  resume: "RUNNING", complete: "COMPLETED", fail: "FAILED", collect: "COLLECTED" } as const;

/** A reserved machine stays reserved while another waiting job is still assigned to it. */
async function otherWaitingJob(tx: Prisma.TransactionClient, job: Job, machineId: string) {
  return tx.job.findFirst({ where: { spaceId: job.spaceId, assignedMachineId: machineId, id: { not: job.id },
    status: { in: ["SUBMITTED", "APPROVED"] } }, select: { id: true } });
}

/** The sole UPDATE of Job.status. Submit uses the schema's SUBMITTED default. */
async function save(tx: Prisma.TransactionClient, job: Job, data: Prisma.JobUncheckedUpdateInput) {
  return tx.job.update({ where: { spaceId_id: { spaceId: job.spaceId, id: job.id } }, data });
}

export async function approveInTransaction(tx: Prisma.TransactionClient, job: Job, actorId: string | null,
  command: Extract<JobCommand, { kind: "approve" }>, settings: SpaceJobSettings, payments: JobPaymentEffects) {
  if (job.status !== "SUBMITTED") throw new JobGuardError("Only submitted jobs can be approved.");
  const minutes = command.estimatedMinutes ?? job.estimatedMinutes;
  const quantity = command.estimatedQuantity ?? job.estimatedQuantity?.toString() ?? null;
  if (minutes != null) nonNegativeInteger(minutes);
  if (quantity != null && toMilli(quantity) < BigInt(0)) throw new JobGuardError("Estimates cannot be negative.");
  if (command.priceOverride !== undefined) {
    nonNegativeInteger(command.priceOverride);
    requireReason(command.reason);
    if (!actorId || !can((await jobAccess(tx, job.spaceId, actorId)).role, "payments.manage")) throw new JobGuardError("Price overrides require payments.manage.");
  }
  const price = await quoteJob(tx, job, settings, minutes, quantity, command.priceOverride);
  const approved = await save(tx, job, { status: "APPROVED", estimatedMinutes: minutes, estimatedQuantity: quantity,
    reviewedAt: new Date(), reviewedById: actorId, ...price,
    priceOverrideReason: command.priceOverride !== undefined ? command.reason!.trim() : "" });
  await payments.onApproved(tx, approved);
  const ids = await jobEvent(tx, approved, "approved", actorId, settings, job.status, command.note ?? "",
    command.priceOverride !== undefined ? { priceOverride: command.priceOverride } : undefined);
  return { job: await tx.job.findUniqueOrThrow({ where: { id: job.id } }), webhookDeliveryIds: ids };
}

async function reprint(tx: Prisma.TransactionClient, job: Job, actorId: string, settings: SpaceJobSettings, payments: JobPaymentEffects) {
  const rootId = job.reprintOfId ?? job.id;
  const root = await tx.job.findFirst({ where: { spaceId: job.spaceId, id: rootId } });
  if (!root) throw new JobGuardError("The original job was not found.");
  const copy = await tx.job.create({ data: { id: randomUUID(), spaceId: job.spaceId, number: await nextJobNumber(tx, job.spaceId),
    requesterId: root.requesterId, audience: root.audience, typeId: root.typeId, machineId: job.machineId,
    title: root.title, description: root.description, sourceLink: root.sourceLink, requestData: root.requestData as Prisma.InputJsonValue,
    quantity: root.quantity, currency: root.currency, reprintOfId: root.id, statusToken: randomBytes(32).toString("hex") } });
  const approved = await approveInTransaction(tx, copy, actorId, { kind: "approve", estimatedMinutes: job.estimatedMinutes ?? undefined,
    estimatedQuantity: job.estimatedQuantity?.toString() }, settings, payments);
  approved.webhookDeliveryIds.push(...await jobEvent(tx, job, "reprinted", actorId, settings, job.status, "", { reprintId: copy.id }));
  return approved;
}

async function runTransition(tx: Prisma.TransactionClient, context: JobContext, command: JobCommand, dependencies: JobDependencies) {
  const job = await lockJob(tx, context.spaceId, context.jobId);
  const access = await jobAccess(tx, context.spaceId, context.actorId);
  // A machine-type manager sees only jobs of their types: others answer not-found, and on their own request for
  // another type they act only as its requester.
  const outOfScope = access.role === "TYPE_MANAGER" && !(await actorMayUseType(tx, context.spaceId, context.actorId, job.typeId));
  if (outOfScope && job.requesterId !== context.actorId) throw new JobNotFoundError();
  const role = outOfScope ? "MEMBER" : access.role;
  const settings = await jobSettings(tx, job.spaceId);
  const payments = dependencies.payments ?? jobPaymentEffects;
  const review = ["approve", "reject", "reprint", "priority", "reassign"].includes(command.kind);
  const capability = review ? "jobs.review" : "jobs.operate";
  if (command.kind === "cancel" && !can(role, "jobs.review")) {
    if (job.requesterId !== context.actorId || !settings.allowRequesterCancel || !["SUBMITTED", "APPROVED"].includes(job.status)) throw new JobGuardError("You cannot cancel this job.");
  } else if (command.kind === "note" && !can(role, "jobs.review")) {
    if (job.requesterId !== context.actorId || command.internal) throw new JobGuardError("You cannot add this note.");
  } else if (command.kind !== "note" && !can(role, capability)) throw new JobGuardError("You cannot perform this job action.");
  if (!allowed[command.kind].includes(job.status)) throw new JobGuardError(`Cannot ${command.kind} a ${job.status.toLowerCase()} job.`);
  if (command.kind === "approve") return approveInTransaction(tx, job, context.actorId, command, settings, payments);
  if (command.kind === "reprint") return reprint(tx, job, context.actorId, settings, payments);
  let data: Prisma.JobUncheckedUpdateInput = {};
  const webhookDeliveryIds: string[] = [];
  let eventData: Prisma.InputJsonObject | undefined;
  let note = "";
  if (command.kind === "start" || command.kind === "collect") {
    const needed = command.kind === "start" || (settings.requirePaymentBeforeCollection && job.paymentTiming !== "PAY_LATER");
    const paid = !needed || await (command.kind === "start" ? payments.canStart(tx, job) : payments.canCollect(tx, job));
    if (command.paymentOverrideReason !== undefined) {
      if (!can(role, "payments.manage")) throw new JobGuardError("Payment overrides require payments.manage.");
      note = requireReason(command.paymentOverrideReason);
      eventData = { paymentOverride: true };
    } else if (!paid) throw new JobGuardError("This job is not paid.");
  }
  if (command.kind === "start") {
    const start = await prepareStart(tx, job, context.actorId, command);
    data = start.data; webhookDeliveryIds.push(...start.webhookDeliveryIds);
  } else if (command.kind === "pause" || command.kind === "resume") {
    if (!job.assignedMachineId) throw new JobGuardError("The job has no running machine.");
    if (command.kind === "resume") {
      await lockTypeCapacity(tx, job.spaceId, job.typeId);
      const type = await tx.machineType.findUniqueOrThrow({ where: { id: job.typeId } });
      if (type.maxConcurrentJobs != null && await tx.job.count({ where: { spaceId: job.spaceId, typeId: job.typeId, status: "RUNNING" } }) >= type.maxConcurrentJobs) throw new JobGuardError("This type is at its concurrent job limit.");
    }
    const machine = await lockJobMachine(tx, job.spaceId, job.assignedMachineId);
    if (machine.status !== (command.kind === "pause" ? "RUNNING" : "PAUSED")) throw new JobGuardError("The machine is not in the expected state.");
    webhookDeliveryIds.push(...(await changeMachineStatus(tx, { ...context, machineId: machine.id,
      status: command.kind === "pause" ? "PAUSED" : "RUNNING", note: `Job ${events[command.kind]}` })).webhookDeliveryIds);
  } else if (command.kind === "complete" || command.kind === "fail") {
    const finish = await prepareFinish(tx, job, context.actorId, command);
    data = finish.data; eventData = finish.eventData; webhookDeliveryIds.push(...finish.webhookDeliveryIds);
  } else if (command.kind === "reject" || command.kind === "cancel") {
    note = command.kind === "reject" ? requireReason(command.reason) : (command.reason ?? "").trim().slice(0, 2000);
    if (job.assignedMachineId) {
      const machine = await lockJobMachine(tx, job.spaceId, job.assignedMachineId);
      if ((machine.status === "PAUSED" && job.status === "PAUSED") || (machine.status === "RESERVED" && !(await otherWaitingJob(tx, job, machine.id)))) webhookDeliveryIds.push(...(await changeMachineStatus(tx,
        { ...context, machineId: machine.id, status: "IDLE", note: "Job cancelled" })).webhookDeliveryIds);
    }
    if (job.poolId) webhookDeliveryIds.push(...(await release(tx, { spaceId: job.spaceId, poolId: job.poolId,
      jobId: job.id, reserved: job.reservedQuantity, actorId: context.actorId })).webhookDeliveryIds);
    data = { statusReason: note, ...(command.kind === "cancel" ? { cancelledAt: new Date(), cancelledById: context.actorId } : { reviewedAt: new Date(), reviewedById: context.actorId }) };
  } else if (command.kind === "collect") data = { collectedAt: new Date(), collectedById: context.actorId };
  else if (command.kind === "priority") {
    nonNegativeInteger(command.priority); data = { priority: command.priority }; eventData = { priority: command.priority };
  } else if (command.kind === "reassign") {
    // Lock both machines in stable order when releasing an earlier reservation.
    const machines = new Map<string, Awaited<ReturnType<typeof lockJobMachine>>>();
    for (const id of [...new Set([job.assignedMachineId, command.machineId].filter((id): id is string => !!id))].sort()) {
      machines.set(id, await lockJobMachine(tx, job.spaceId, id));
    }
    if (command.machineId) {
      const machine = machines.get(command.machineId)!;
      if (machine.typeId !== job.typeId || machine.retiredAt || !machine.acceptsJobs) throw new JobGuardError("Choose an active machine of this type.");
    }
    if (job.assignedMachineId && job.assignedMachineId !== command.machineId && machines.get(job.assignedMachineId)?.status === "RESERVED"
      && !(await otherWaitingJob(tx, job, job.assignedMachineId))) {
      webhookDeliveryIds.push(...(await changeMachineStatus(tx, { ...context, machineId: job.assignedMachineId, status: "IDLE", note: "Job reassigned" })).webhookDeliveryIds);
    }
    data = { assignedMachineId: command.machineId }; eventData = { machineId: command.machineId };
  } else if (command.kind === "note") {
    note = requireReason(command.body);
    await tx.jobNote.create({ data: { spaceId: job.spaceId, jobId: job.id, authorId: context.actorId, body: note, internal: command.internal ?? false } });
    // Internal note text never enters a webhook, audit record or notification.
    eventData = { internal: command.internal ?? false }; note = "";
  }
  const target = statusFor[command.kind as keyof typeof statusFor];
  const updated = await save(tx, job, { ...data, ...(target ? { status: target } : {}) });
  if (command.kind === "complete") await payments.onCompleted(tx, updated);
  if (command.kind === "reject" || command.kind === "cancel" || command.kind === "fail") await payments.onRejectedCancelledFailed(tx, updated, events[command.kind]);
  webhookDeliveryIds.push(...await jobEvent(tx, updated, events[command.kind], context.actorId, settings, job.status, note, eventData));
  return { job: await tx.job.findUniqueOrThrow({ where: { id: job.id } }), webhookDeliveryIds };
}

export async function transitionJob(context: JobContext, command: JobCommand, dependencies: JobDependencies = {}) {
  const result = await prisma.$transaction((tx) => runTransition(tx, context, command, dependencies), { timeout: 15000 });
  await enqueueWebhookDeliveries(result.webhookDeliveryIds);
  const warnings: string[] = [];
  if (command.kind === "start" && result.job.assignedMachineId) {
    try {
      const connection = await prisma.printerConnection.findFirst({ where: { spaceId: context.spaceId, machineId: result.job.assignedMachineId, enabled: true } });
      if (connection) {
        if (!dependencies.startPrinter) throw new Error("Adapter unavailable");
        await dependencies.startPrinter({ spaceId: context.spaceId, jobId: result.job.id, machineId: result.job.assignedMachineId });
      }
    } catch { warnings.push("The job started, but the printer did not confirm its start. Check the printer."); }
  }
  return { ...result, warnings };
}
