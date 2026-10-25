import "server-only";
import type { Job, Prisma } from "@prisma/client";
import { can, isStaffRole, type Capability } from "@/lib/permissionRoles";

export class JobNotFoundError extends Error {
  constructor() { super("Space not found."); }
}
export class JobGuardError extends Error {}
export type JobContext = { spaceId: string; actorId: string; jobId: string };

export async function jobAccess(tx: Prisma.TransactionClient, spaceId: string, actorId: string, capability?: Capability) {
  const space = await tx.space.findUnique({ where: { id: spaceId } });
  if (!space) throw new JobNotFoundError();
  if (space.status !== "ACTIVE") throw new JobGuardError("This space is not accepting job changes.");
  const user = await tx.user.findUnique({ where: { id: actorId } });
  if (!user) throw new JobNotFoundError();
  const member = await tx.spaceMember.findFirst({ where: { spaceId, userId: actorId } });
  const role = member?.status === "ACTIVE" ? member.role : null;
  if (isStaffRole(role) && !user.mfaEnabledAt) throw new JobGuardError("Set up an authenticator before managing jobs.");
  if (capability && !can(role, capability)) throw new JobGuardError("You cannot perform this job action.");
  return { space, user, member, role };
}

export async function lockJob(tx: Prisma.TransactionClient, spaceId: string, jobId: string) {
  const rows = await tx.$queryRaw<Job[]>`SELECT * FROM "Job" WHERE "spaceId" = ${spaceId} AND "id" = ${jobId} FOR UPDATE`;
  if (!rows[0]) throw new JobNotFoundError();
  return rows[0];
}

export async function lockJobMachine(tx: Prisma.TransactionClient, spaceId: string, machineId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Machine" WHERE "spaceId" = ${spaceId} AND "id" = ${machineId} FOR UPDATE`;
  if (!rows[0]) throw new JobNotFoundError();
  return tx.machine.findUniqueOrThrow({ where: { spaceId_id: { spaceId, id: machineId } } });
}

/** After the job lock, before machine/pool locks. Serialises capacity checks across different machines. */
export async function lockTypeCapacity(tx: Prisma.TransactionClient, spaceId: string, typeId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`jobs:type:${spaceId}:${typeId}`}, 0))::text`;
}

export async function jobSettings(tx: Prisma.TransactionClient, spaceId: string) {
  return await tx.spaceJobSettings.findUnique({ where: { spaceId } }) ??
    tx.spaceJobSettings.upsert({ where: { spaceId }, create: { spaceId }, update: {} });
}

export async function nextJobNumber(tx: Prisma.TransactionClient, spaceId: string) {
  return (await tx.spaceCounter.upsert({ where: { spaceId_key: { spaceId, key: "job" } },
    create: { spaceId, key: "job", value: 1 }, update: { value: { increment: 1 } } })).value;
}

export function requireReason(reason?: string) {
  if (!reason?.trim() || reason.length > 2000) throw new JobGuardError("Give a reason of up to 2000 characters.");
  return reason.trim();
}
export function nonNegativeInteger(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new JobGuardError("Enter a non-negative whole number.");
  return value;
}
