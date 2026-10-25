import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { validateJobFiles, type JobUpload } from "@/lib/files";
import type { FilePolicy } from "@/lib/machines/filePolicy";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { can, spaceAllows } from "@/lib/permissionRoles";
import { downloadJobFile } from "@/lib/storage/jobFiles";
import { JobGuardError, JobNotFoundError } from "./context";
import { inScope, scopeForRole } from "@/lib/typeScope";

export async function prepareJobFiles(uploads: readonly JobUpload[], policy: FilePolicy) {
  let files: ReturnType<typeof validateJobFiles>;
  try { files = validateJobFiles(uploads, policy); }
  catch (error) { throw new JobGuardError(error instanceof Error ? error.message : "Check the job files."); }
  for (const file of files) {
    if (!file.contentType.startsWith("image/")) continue;
    const image = await createSafeWebpDerivative(new File([file.body], file.filename), { width: 4000, height: 4000, fit: "inside" });
    if ("error" in image) throw new JobGuardError(image.error);
    file.body = Buffer.from(image.body);
    file.extension = "webp";
    file.filename = file.filename.replace(/\.[^.]+$/, ".webp");
    file.contentType = "image/webp";
    file.sizeBytes = image.body.length;
    file.sha256 = createHash("sha256").update(image.body).digest("hex");
  }
  return files;
}

/** Reprints reference root files through reprintOfId; no duplicate object or JobFile row is created. */
export async function jobFilesForRequester(spaceId: string, jobId: string, actorId: string) {
  const job = await prisma.job.findFirst({ where: { spaceId, id: jobId }, include: { space: { select: { status: true } } } });
  if (!job || !spaceAllows(job.space.status, "jobs.view")) throw new JobNotFoundError();
  if (job.requesterId !== actorId) {
    const member = await prisma.spaceMember.findFirst({ where: { spaceId, userId: actorId }, include: { user: true } });
    if (member?.status !== "ACTIVE" || !member.user.mfaEnabledAt || !can(member.role, "jobs.view")) throw new JobNotFoundError();
    if (!inScope(await scopeForRole(prisma, spaceId, actorId, member.role), job.typeId)) throw new JobNotFoundError();
  }
  return prisma.jobFile.findMany({ where: { spaceId, jobId: job.reprintOfId ?? job.id } });
}
export async function downloadAuthorisedJobFile(spaceId: string, jobId: string, fileId: string, actorId: string) {
  const file = (await jobFilesForRequester(spaceId, jobId, actorId)).find((file) => file.id === fileId);
  if (!file) throw new JobNotFoundError();
  return downloadJobFile(file.storageKey);
}
