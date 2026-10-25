import "server-only";
import { prisma } from "@/lib/db";
import { queuePosition } from "./queue";
import { queueLabel, remainingMinutes } from "./presentation";
import { readFields, specRows } from "@/lib/machines/fields";

export async function queueFor(job: Parameters<typeof queuePosition>[0]) {
  const [jobs, machines] = await Promise.all([
    prisma.job.findMany({ where: { spaceId: job.spaceId, typeId: job.typeId, status: { in: ["SUBMITTED", "APPROVED", "RUNNING", "PAUSED"] } },
      select: { id: true, spaceId: true, typeId: true, machineId: true, assignedMachineId: true, status: true, priority: true, submittedAt: true, estimatedMinutes: true, startedAt: true } }),
    prisma.machine.findMany({ where: { spaceId: job.spaceId, typeId: job.typeId, retiredAt: null, acceptsJobs: true, status: { in: ["IDLE", "RESERVED", "RUNNING", "PAUSED"] } }, select: { id: true, spaceId: true, typeId: true } }),
  ]);
  return queueLabel(queuePosition(job, jobs, machines));
}

export const PAYMENT_SELECT = { id: true, jobId: true, kind: true, amount: true, currency: true, status: true,
  method: true, reference: true, recordedById: true, confirmedById: true, amountRefunded: true, createdAt: true,
  refunds: { select: { id: true, amount: true, status: true, reason: true, note: true, failureReason: true }, orderBy: { createdAt: "asc" as const } } } as const;

export async function jobDetail(spaceId: string, number: number, staff: boolean, moneyAccess: boolean) {
  const job = await prisma.job.findFirst({ where: { spaceId, number } });
  if (!job) return null;
  const [files, events, notes, payments, type] = await Promise.all([
    prisma.jobFile.findMany({ where: { spaceId, jobId: job.reprintOfId ?? job.id }, select: { id: true, filename: true, sizeBytes: true } }),
    prisma.jobEvent.findMany({ where: { spaceId, jobId: job.id, ...(staff ? {} : { NOT: [{ kind: "noted", data: { path: ["internal"], equals: true } }] }) },
      orderBy: { createdAt: "asc" }, select: { id: true, kind: true, note: true, toStatus: true, createdAt: true } }),
    prisma.jobNote.findMany({ where: { spaceId, jobId: job.id, ...(staff ? {} : { internal: false }) }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, internal: true, createdAt: true } }),
    moneyAccess ? prisma.payment.findMany({ where: { spaceId, jobId: job.id }, orderBy: { createdAt: "asc" }, select: PAYMENT_SELECT }) : [],
    prisma.machineType.findFirstOrThrow({ where: { spaceId, id: job.typeId }, select: { requestFields: true } }),
  ]);
  return { id: job.id, number: job.number, title: job.title, description: job.description, sourceLink: job.sourceLink,
    typeId: job.typeId, status: job.status, statusReason: job.statusReason, requestRows: specRows(readFields(type.requestFields), job.requestData), quantity: job.quantity,
    estimatedMinutes: job.estimatedMinutes, estimatedQuantity: job.estimatedQuantity?.toString() ?? "",
    actualMinutes: job.actualMinutes, assignedMachineId: job.assignedMachineId, machineId: job.machineId,
    currency: job.currency, quotedAmount: moneyAccess ? job.quotedAmount : null, finalAmount: moneyAccess ? job.finalAmount : null, amountPaid: moneyAccess ? job.amountPaid : 0,
    amountRefunded: moneyAccess ? job.amountRefunded : 0, paymentState: job.paymentState, paymentTiming: job.paymentTiming,
    statusToken: staff ? null : job.statusToken, queue: await queueFor(job), remainingMinutes: remainingMinutes(job),
    files, events: events.map((e) => ({ ...e, note: staff || ["approved", "rejected", "cancelled", "failed"].includes(e.kind) ? e.note : "", createdAt: e.createdAt.toISOString() })), notes: notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    payments: payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
  };
}
export type JobDetail = NonNullable<Awaited<ReturnType<typeof jobDetail>>>;
