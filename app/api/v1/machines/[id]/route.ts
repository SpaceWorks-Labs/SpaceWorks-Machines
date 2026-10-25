import { prisma } from "@/lib/db";
import { ApiError, apiRoute } from "@/lib/api/handler";
import { MACHINE_DTO, machineDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("machines:read", {}, async ({ caller, params }) => {
  const row = await prisma.machine.findFirst({ where: { spaceId: caller.spaceId, id: params.id }, select: MACHINE_DTO });
  if (!row) throw new ApiError(404, "Not found.");
  return { data: machineDto(row) };
});
