import "server-only";
import type { Prisma, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Machine-type managers (TYPE_MANAGER) hold machine-side capabilities only for the types assigned to them
 * (TypeManagerAssignment). Every loader and action narrows by this scope; anything outside it answers 404.
 * `null` means every type (any other staff role, or system work with no actor).
 */
export type TypeScope = string[] | null;

export async function managedTypeIds(client: Client, spaceId: string, userId: string) {
  const rows = await client.typeManagerAssignment.findMany({ where: { spaceId, userId }, select: { machineTypeId: true } });
  return rows.map((row) => row.machineTypeId);
}

export async function scopeForRole(client: Client, spaceId: string, userId: string, role: SpaceRole): Promise<TypeScope> {
  return role === "TYPE_MANAGER" ? managedTypeIds(client, spaceId, userId) : null;
}

/** The scope of whoever acts (looked up from their membership); no actor, or a non-type-manager, is unscoped. */
export async function scopeForActor(client: Client, spaceId: string, actorId: string | null | undefined): Promise<TypeScope> {
  if (!actorId) return null;
  const member = await client.spaceMember.findUnique({ where: { userId_spaceId: { userId: actorId, spaceId } }, select: { role: true } });
  return member ? scopeForRole(client, spaceId, actorId, member.role) : null;
}

export function inScope(scope: TypeScope, typeId: string | null | undefined) {
  return scope === null || (typeId != null && scope.includes(typeId));
}

/** Prisma filters for rows that carry a typeId, or belong to a machine. */
export const typeWhere = (scope: TypeScope) => (scope === null ? {} : { typeId: { in: scope } });
export const machineTypeWhere = (scope: TypeScope) => (scope === null ? {} : { machine: { typeId: { in: scope } } });

/**
 * Members holding one of `roles` who may act on this type: a machine type manager only when it is assigned to them.
 * Used to pick assignees and alert recipients, so nobody is handed work they can't open.
 */
export function rolesForType(roles: readonly SpaceRole[], typeId: string): Prisma.SpaceMemberWhereInput {
  const others = roles.filter((role) => role !== "TYPE_MANAGER");
  if (!roles.includes("TYPE_MANAGER")) return { role: { in: others } };
  return { OR: [{ role: { in: others } }, { role: "TYPE_MANAGER", typeAssignments: { some: { machineTypeId: typeId } } }] };
}

/** May this actor touch this type / this machine? Unscoped actors always may (capabilities are checked elsewhere). */
export async function actorMayUseType(client: Client, spaceId: string, actorId: string | null | undefined, typeId: string) {
  return inScope(await scopeForActor(client, spaceId, actorId), typeId);
}

export async function actorMayUseMachine(client: Client, spaceId: string, actorId: string | null | undefined, machineId: string) {
  const scope = await scopeForActor(client, spaceId, actorId);
  if (scope === null) return true;
  const machine = await client.machine.findFirst({ where: { spaceId, id: machineId }, select: { typeId: true } });
  return machine !== null && scope.includes(machine.typeId);
}
