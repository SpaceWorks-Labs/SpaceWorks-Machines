import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/api/handler";
import { JOB_DTO, jobDto } from "@/lib/api/dto";
import { transitionJob } from "@/lib/jobs";
import { commandSchema } from "@/lib/jobs/actionSchemas";
import { printerDependencies } from "@/lib/printers/jobs";

export const dynamic = "force-dynamic";

/** POST /api/v1/jobs/{id}/transitions { kind, ... }: the same per-command checks as the staff console. */
export const POST = apiRoute<{ id: string }>("jobs:write", { write: true, capability: "jobs.view" }, async ({ caller, actorId, params, body }) => {
  const command = await body(commandSchema);
  const { warnings } = await transitionJob({ spaceId: caller.spaceId, actorId: actorId!, jobId: params.id }, command, printerDependencies);
  const row = await prisma.job.findUniqueOrThrow({ where: { id: params.id }, select: JOB_DTO });
  return { data: jobDto(row), warnings };
});
