import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { JobUpload } from "@/lib/files";
import { can } from "@/lib/permissionRoles";
import { isEmail } from "@/lib/outboxPayload";
import { checkRateLimitById } from "@/lib/rateLimit";
import { filePolicySchema } from "@/lib/machines/filePolicy";
import { readFields, validateRequestData } from "@/lib/machines/fields";
import { resolvePricingRule } from "@/lib/pricing";
import { deleteJobFiles, jobFileKey, uploadJobFile } from "@/lib/storage/jobFiles";
import { enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { jobAccess, JobGuardError, JobNotFoundError, jobSettings, nextJobNumber, nonNegativeInteger } from "./context";
import { prepareJobFiles } from "./files";
import { jobEvent } from "./events";
import { approveInTransaction, type JobDependencies } from "./transitions";
import { jobPaymentEffects } from "@/lib/payments/jobs/effects";
import { actorMayUseType } from "@/lib/typeScope";

export type SubmitJobInput = { spaceId: string; actorId: string; typeId: string; machineId?: string;
  requesterEmail?: string; title: string; description?: string; sourceLink?: string;
  requestData?: Record<string, unknown>; quantity?: number; files?: readonly JobUpload[] };

/** Resolve eligibility again inside the submission transaction, after uploads. */
async function submissionContext(tx: Prisma.TransactionClient, input: SubmitJobInput) {
  const access = await jobAccess(tx, input.spaceId, input.actorId);
  const settings = await jobSettings(tx, input.spaceId);
  if (!settings.jobsEnabled) throw new JobGuardError("Jobs are disabled in this space.");
  const staff = can(access.role, "jobs.review");
  if (settings.eligibility === "STAFF_ONLY" && !staff) throw new JobGuardError("Staff must submit this request on your behalf.");
  let requesterId = input.actorId;
  if (input.requesterEmail) {
    if (!staff) throw new JobGuardError("Only staff can submit on behalf of another person.");
    const email = input.requesterEmail.trim().toLowerCase();
    if (!isEmail(email)) throw new JobGuardError("Enter a valid requester email.");
    requesterId = (await tx.user.upsert({ where: { email }, create: { email }, update: {} })).id;
  }
  const member = await tx.spaceMember.findFirst({ where: { spaceId: input.spaceId, userId: requesterId } });
  if (member?.status === "BLOCKED") throw new JobGuardError("This requester is blocked from jobs in this space.");
  const audience = member?.status === "ACTIVE" ? "MEMBER" as const : "PUBLIC" as const;
  if (settings.eligibility === "MEMBERS_ONLY" && audience !== "MEMBER") throw new JobGuardError("Only active members can request jobs in this space.");
  const type = await tx.machineType.findFirst({ where: { spaceId: input.spaceId, id: input.typeId } });
  // Submitting on someone's behalf is a staff action: a machine-type manager may do it only for their types.
  if (!type || (input.requesterEmail && !(await actorMayUseType(tx, input.spaceId, input.actorId, type.id)))) throw new JobNotFoundError();
  if (!type.acceptsJobs || type.archivedAt) throw new JobGuardError("This machine type is not accepting jobs.");
  if (input.machineId) {
    if (!type.requesterPicksMachine && !staff) throw new JobGuardError("Staff allocate machines for this type.");
    const machine = await tx.machine.findFirst({ where: { spaceId: input.spaceId, id: input.machineId, typeId: type.id } });
    if (!machine) throw new JobNotFoundError();
    if (machine.retiredAt || !machine.acceptsJobs) throw new JobGuardError("This machine is not accepting jobs.");
  }
  const rules = await tx.pricingRule.findMany({ where: { spaceId: input.spaceId } });
  const rule = resolvePricingRule(rules, { ...input, ...settings, audience });
  return { ...access, settings, requesterId, audience, type, rule };
}

export async function submitJob(input: SubmitJobInput, dependencies: JobDependencies = {}) {
  if (!input.title.trim() || input.title.length > 200) throw new JobGuardError("Give the job a title of up to 200 characters.");
  if ((input.description?.length ?? 0) > 10000) throw new JobGuardError("Keep the description under 10000 characters.");
  const quantity = nonNegativeInteger(input.quantity ?? 1);
  if (!quantity) throw new JobGuardError("Quantity must be at least one.");
  if (input.sourceLink) {
    const url = new URL(input.sourceLink);
    if (!["http:", "https:"].includes(url.protocol) || input.sourceLink.length > 2048) throw new JobGuardError("Use an HTTP or HTTPS source link.");
  }
  if (!await checkRateLimitById("create", `job:${input.spaceId}:${input.actorId}`)) throw new JobGuardError("Too many job requests. Try again later.");
  const initial = await prisma.$transaction((tx) => submissionContext(tx, input));
  const policy = filePolicySchema.parse(initial.type.filePolicy);
  const files = await prepareJobFiles(input.files ?? [], policy);
  const jobId = randomUUID();
  const keys: string[] = [];
  let committed = false;
  try {
    for (const file of files) {
      const key = jobFileKey(input.spaceId, jobId, file.extension);
      keys.push(key);
      await uploadJobFile(key, file.body, file.contentType);
    }
    const result = await prisma.$transaction(async (tx) => {
      const current = await submissionContext(tx, input);
      if (JSON.stringify(current.type.filePolicy) !== JSON.stringify(initial.type.filePolicy)) throw new JobGuardError("The file policy changed. Submit the files again.");
      // Serialise limits by requester before minting the space sequence; no existing job is locked here.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`jobs:requester:${input.spaceId}:${current.requesterId}`}, 0))::text`;
      const limit = current.type.maxOpenJobsPerRequester ?? current.settings.maxOpenJobsPerRequester;
      const count = await tx.job.count({ where: { spaceId: input.spaceId, requesterId: current.requesterId,
        ...(current.type.maxOpenJobsPerRequester != null ? { typeId: current.type.id } : {}),
        status: { in: ["SUBMITTED", "APPROVED", "RUNNING", "PAUSED", "COMPLETED"] } } });
      if (count >= limit) throw new JobGuardError("This requester has reached the open job limit.");
      const request = validateRequestData(readFields(current.type.requestFields), input.requestData ?? {}, current.type);
      if (!request.ok) throw new JobGuardError(Object.values(request.errors).join(". "));
      const job = await tx.job.create({ data: { id: jobId, spaceId: input.spaceId, requesterId: current.requesterId,
        typeId: current.type.id, machineId: input.machineId, title: input.title.trim(), description: input.description ?? "",
        sourceLink: input.sourceLink ?? "", requestData: request.values as Prisma.InputJsonValue, quantity,
        currency: current.space.currency, audience: current.audience, number: await nextJobNumber(tx, input.spaceId),
        statusToken: randomBytes(32).toString("hex") } });
      for (const [index, file] of files.entries()) await tx.jobFile.create({ data: { spaceId: input.spaceId, jobId,
        filename: file.filename, contentType: file.contentType, sizeBytes: file.sizeBytes, sha256: file.sha256,
        metadata: file.metadata as Prisma.InputJsonValue, storageKey: keys[index], uploadedById: input.actorId } });
      const webhookDeliveryIds = await jobEvent(tx, job, "submitted", input.actorId, current.settings);
      if (!current.type.requiresApproval && (!current.rule || ["FREE", "FLAT"].includes(current.rule.mode))) {
        const approved = await approveInTransaction(tx, job, null, { kind: "approve" }, current.settings, dependencies.payments ?? jobPaymentEffects);
        webhookDeliveryIds.push(...approved.webhookDeliveryIds);
        return { job: approved.job, webhookDeliveryIds };
      }
      return { job, webhookDeliveryIds };
    }, { timeout: 15000 });
    committed = true;
    await enqueueWebhookDeliveries(result.webhookDeliveryIds);
    return result;
  } catch (error) {
    if (!committed) await deleteJobFiles(keys).catch(() => console.error("[jobs] Could not remove uncommitted uploads."));
    throw error;
  }
}
