import { prisma } from "@/lib/db";
import { apiRoute, page, paged } from "@/lib/api/handler";
import { JOB_DTO, jobDto } from "@/lib/api/dto";
import { submitJob } from "@/lib/jobs";
import { submitSchema } from "@/lib/jobs/actionSchemas";

export const dynamic = "force-dynamic";
const STATUSES = ["SUBMITTED", "APPROVED", "RUNNING", "PAUSED", "COMPLETED", "COLLECTED", "REJECTED", "FAILED", "CANCELLED"] as const;

/** GET /api/v1/jobs?status=&cursor=&limit= */
export const GET = apiRoute("jobs:read", {}, async ({ caller, query }) => {
  const status = STATUSES.find((value) => value === query.get("status"));
  const rows = await prisma.job.findMany({ where: { spaceId: caller.spaceId, ...(status ? { status } : {}) }, select: JOB_DTO, ...page(query) });
  return paged(rows.map(jobDto), query);
});

/** POST /api/v1/jobs: create a job on behalf of an account (requesterEmail), without files. */
export const POST = apiRoute("jobs:write", { write: true, capability: "jobs.review" }, async ({ caller, actorId, body }) => {
  const input = await body(submitSchema.required({ requesterEmail: true }));
  const { job } = await submitJob({ ...input, spaceId: caller.spaceId, actorId: actorId! });
  const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, select: JOB_DTO });
  return { data: jobDto(row) };
});
