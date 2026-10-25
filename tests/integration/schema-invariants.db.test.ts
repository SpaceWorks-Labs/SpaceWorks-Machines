import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
let spaceId: string;
let userId: string;

describe.sequential("production database invariants", () => {
  beforeAll(async () => {
    const space = await prisma.space.create({
      data: { name: "Schema invariant space", slug: `schema-invariants-${suffix}` },
    });
    spaceId = space.id;
    userId = (await prisma.user.create({ data: { email: `schema-user-${suffix}@example.test` } })).id;
  });

  afterAll(async () => {
    if (spaceId) await prisma.space.deleteMany({ where: { id: spaceId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("rejects malformed space addresses, months, limits and currencies", async () => {
    const make = (data: Record<string, unknown>) =>
      prisma.space.create({ data: { name: "Bad", slug: `bad-${suffix}`, ...data } });
    await expect(make({ slug: `Bad_Slug_${suffix}` })).rejects.toThrow();
    await expect(make({ financialYearStartMonth: 13 })).rejects.toThrow();
    await expect(make({ financialYearStartMonth: 0 })).rejects.toThrow();
    await expect(make({ memberLimit: 0 })).rejects.toThrow();
    await expect(make({ staffLimit: -1 })).rejects.toThrow();
    await expect(make({ currency: "inr" })).rejects.toThrow();
  });

  it("allows one team row per person per space", async () => {
    await prisma.spaceMember.create({ data: { userId, spaceId, role: "MACHINE_MANAGER" } });
    await expect(prisma.spaceMember.create({ data: { userId, spaceId, role: "VIEWER" } })).rejects.toThrow();
  });

  it("requires a note on refusals and change requests", async () => {
    await expect(prisma.spaceReview.create({ data: { spaceId, action: "REJECTED" } })).rejects.toThrow();
    await expect(prisma.spaceReview.create({ data: { spaceId, action: "CHANGES_REQUESTED", reason: "   " } })).rejects.toThrow();
    await expect(prisma.spaceReview.create({ data: { spaceId, action: "CHANGES_REQUESTED", reason: "Add your address" } })).resolves.toBeTruthy();
    await expect(prisma.spaceReview.create({ data: { spaceId, action: "APPROVED" } })).resolves.toBeTruthy();
  });

  it("records who used an invite only together with when", async () => {
    await expect(prisma.spaceInvite.create({ data: { spaceId, token: `t-${suffix}-1`, usedByUserId: userId } })).rejects.toThrow();
    await expect(prisma.spaceInvite.create({ data: { spaceId, token: `t-${suffix}-2`, usedByUserId: userId, usedAt: new Date() } })).resolves.toBeTruthy();
  });

  it("rejects impossible outbox states and negative attempts", async () => {
    await expect(prisma.outboxMessage.create({ data: { kind: "space-notice", payload: {}, status: "SENT", sentAt: null } })).rejects.toThrow();
    await expect(prisma.outboxMessage.create({ data: { kind: "space-notice", payload: {}, status: "PROCESSING" } })).rejects.toThrow();
    await expect(prisma.outboxMessage.create({ data: { kind: "space-notice", payload: {}, attempts: -1 } })).rejects.toThrow();
  });

  it("removes a space's team, invites and review history with it", async () => {
    const space = await prisma.space.create({ data: { name: "Cascade", slug: `cascade-${suffix}` } });
    await prisma.spaceMember.create({ data: { userId, spaceId: space.id, role: "MACHINE_MANAGER" } });
    await prisma.spaceInvite.create({ data: { spaceId: space.id, token: `cascade-${suffix}` } });
    await prisma.spaceReview.create({ data: { spaceId: space.id, action: "SUBMITTED" } });
    await prisma.space.delete({ where: { id: space.id } });
    expect(await prisma.spaceMember.count({ where: { spaceId: space.id } })).toBe(0);
    expect(await prisma.spaceInvite.count({ where: { spaceId: space.id } })).toBe(0);
    expect(await prisma.spaceReview.count({ where: { spaceId: space.id } })).toBe(0);
  });
});
