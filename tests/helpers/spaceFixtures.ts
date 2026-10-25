import { randomUUID } from "node:crypto";
import type { JoinPolicy, Prisma, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Disposable spaces and people for integration tests. Every row carries a random suffix, and `cleanup`
 * removes what this fixture made (spaces cascade to their members, invites, settings and channels).
 */
export function spaceFixtures(label: string) {
  const suffix = `${label}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const spaceIds: string[] = [];
  const userIds: string[] = [];

  async function space(data: Partial<Prisma.SpaceUncheckedCreateInput> & { joinPolicy?: JoinPolicy } = {}) {
    const created = await prisma.space.create({ data: { name: `Lab ${spaceIds.length + 1}`, slug: `lab-${spaceIds.length + 1}-${suffix}`, status: "ACTIVE", ...data } });
    spaceIds.push(created.id);
    return created;
  }

  async function person(name: string, data: Partial<Prisma.UserUncheckedCreateInput> = {}) {
    const created = await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}-${suffix}@example.test`, emailVerified: new Date(), ...data } });
    userIds.push(created.id);
    return created;
  }

  async function member(spaceId: string, userId: string, role: SpaceRole, status: "ACTIVE" | "PENDING" | "BLOCKED" = "ACTIVE") {
    return prisma.spaceMember.create({ data: { spaceId, userId, role, status } });
  }

  async function cleanup() {
    if (spaceIds.length) {
      await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'spaceId' = ANY(${spaceIds})`;
      await prisma.processedWebhookEvent.deleteMany({ where: { spaceId: { in: spaceIds } } });
      await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
    }
    if (userIds.length) {
      await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
      await prisma.verificationToken.deleteMany({ where: { identifier: { in: userIds.map((id) => `magic-link:${id}`) } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  return { suffix, space, person, member, cleanup };
}
