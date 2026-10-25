import { prisma } from "@/lib/db";
import { ApiError, apiRoute } from "@/lib/api/handler";
import { JOB_DTO, jobDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("jobs:read", {}, async ({ caller, params }) => {
  const row = await prisma.job.findFirst({ where: { spaceId: caller.spaceId, id: params.id }, select: JOB_DTO });
  if (!row) throw new ApiError(404, "Not found.");
  return { data: jobDto(row) };
});
