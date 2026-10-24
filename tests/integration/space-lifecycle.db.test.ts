import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ current: { id: "", email: "" } }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.current.id ? { user: identity.current } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/permissions")>()),
  // Here the platform admin is whoever is signed in.
  requireSuperAdmin: async () => ({ user: identity.current }),
}));

import { prisma } from "@/lib/db";
import { resubmitSpaceApplication, submitSpaceApplication } from "@/app/actions/space-application";
import { createSpaceForOwner, reviewSpace } from "@/app/actions/super-admin-spaces";
import { createSpaceInvite } from "@/app/actions/space-invites";
import { acceptSpaceInviteToken } from "@/lib/inviteAcceptance";

const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
const users = { applicant: { id: "", email: `applicant-${suffix}@example.test` }, admin: { id: "", email: `admin-${suffix}@example.test` }, unverified: { id: "", email: `unverified-${suffix}@example.test` }, owner: { id: "", email: `owner-${suffix}@example.test` } };
const createdSpaceIds: string[] = [];

const application = (overrides: Record<string, unknown> = {}) => ({
  name: "Kochi Makers Lab",
  slug: `kochi-makers-${suffix}`,
  description: "A makerspace in Kochi with 3D printers, a laser cutter and a CNC router for everyone.",
  contactEmail: `club-${suffix}@example.test`,
  contactPhone: "",
  website: "",
  addressLine: "",
  city: "Kochi",
  region: "Kerala",
  postalCode: "682001",
  country: "IN",
  ...overrides,
});

const signIn = (user: { id: string; email: string }) => {
  identity.current = user;
};

async function outboxFor(spaceId: string) {
  return prisma.$queryRaw<Array<{ kind: string; payload: Record<string, unknown> }>>`
    SELECT "kind", "payload" FROM "OutboxMessage" WHERE "payload"->>'spaceId' = ${spaceId} ORDER BY "createdAt" ASC`;
}

beforeAll(async () => {
  for (const [key, user] of Object.entries(users)) {
    const created = await prisma.user.create({
      data: { email: user.email, emailVerified: key === "unverified" ? null : new Date(), isSuperAdmin: key === "admin", mfaEnabledAt: new Date() },
    });
    user.id = created.id;
  }
});

afterAll(async () => {
  if (createdSpaceIds.length) {
    await prisma.$executeRaw`DELETE FROM "OutboxMessage" WHERE "payload"->>'spaceId' = ANY(${createdSpaceIds})`;
    await prisma.space.deleteMany({ where: { id: { in: createdSpaceIds } } });
  }
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: Object.values(users).map((user) => user.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((user) => user.id) } } });
  await prisma.$disconnect();
});

describe.sequential("space application lifecycle", () => {
  let spaceId = "";
  const slug = `kochi-makers-${suffix}`;

  it("refuses an applicant whose email is not verified", async () => {
    signIn(users.unverified);
    const result = await submitSpaceApplication(application({ slug: `unverified-${suffix}` }));
    expect(result.ok).toBe(false);
    expect(await prisma.space.count({ where: { slug: `unverified-${suffix}` } })).toBe(0);
  });

  it("creates a pending space owned by the applicant, with history and emails", async () => {
    signIn(users.applicant);
    const result = await submitSpaceApplication(application());
    expect(result).toEqual({ ok: true, data: { slug } });
    const space = await prisma.space.findUniqueOrThrow({ where: { slug }, include: { members: true, reviews: true } });
    spaceId = space.id;
    createdSpaceIds.push(space.id);
    expect(space.status).toBe("PENDING_REVIEW");
    expect(space.source).toBe("SELF_SIGNUP");
    expect(space.region).toBe("Kerala");
    expect(space.members).toEqual([expect.objectContaining({ userId: users.applicant.id, role: "MACHINE_MANAGER" })]);
    expect(space.reviews).toEqual([expect.objectContaining({ action: "SUBMITTED", actorUserId: users.applicant.id, applicationSnapshot: expect.objectContaining({ name: "Kochi Makers Lab", slug }) })]);
    const messages = await outboxFor(space.id);
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "space-notice", payload: expect.objectContaining({ to: users.applicant.email, notice: "received" }) }),
      expect.objectContaining({ kind: "space-application-alert", payload: expect.objectContaining({ to: users.admin.email }) }),
    ]));
  });

  it("refuses a second application for a taken address", async () => {
    signIn(users.owner);
    const result = await submitSpaceApplication(application());
    expect(result).toMatchObject({ ok: false, fieldErrors: { slug: ["That web address is taken"] } });
  });

  it("keeps the team out of everything but the application before approval", async () => {
    signIn(users.applicant);
    const invite = await createSpaceInvite({ spaceSlug: slug, role: "VIEWER" });
    expect(invite.ok).toBe(false);
  });

  it("needs a note to ask for changes, then tells the machine managers", async () => {
    signIn(users.admin);
    expect(await reviewSpace({ spaceId: spaceId, decision: "request-changes" })).toMatchObject({ ok: false });
    expect(await reviewSpace({ spaceId: spaceId, decision: "request-changes", reason: "Add your PIN code and full address." })).toEqual({ ok: true });
    expect((await prisma.space.findUniqueOrThrow({ where: { id: spaceId } })).status).toBe("CHANGES_REQUESTED");
    const notices = (await outboxFor(spaceId)).filter((message) => message.kind === "space-notice");
    expect(notices.at(-1)?.payload).toMatchObject({ notice: "changes-requested", reason: "Add your PIN code and full address." });
  });

  it("lets the machine manager fix and resend, back into review", async () => {
    signIn(users.applicant);
    const result = await resubmitSpaceApplication({ ...application({ addressLine: "12 Marine Drive" }), spaceSlug: slug });
    expect(result).toEqual({ ok: true });
    const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(space.status).toBe("PENDING_REVIEW");
    expect(space.addressLine).toBe("12 Marine Drive");
    expect(space.reviews[0]).toMatchObject({ action: "RESUBMITTED" });
    // Already back in review: a second resend is refused.
    expect((await resubmitSpaceApplication({ ...application(), spaceSlug: slug })).ok).toBe(false);
  });

  it("approves once, and refuses a stale second decision", async () => {
    signIn(users.admin);
    expect(await reviewSpace({ spaceId: spaceId, decision: "approve" })).toEqual({ ok: true });
    expect((await prisma.space.findUniqueOrThrow({ where: { id: spaceId } })).status).toBe("ACTIVE");
    expect(await reviewSpace({ spaceId: spaceId, decision: "approve" })).toMatchObject({ ok: false });
    expect(await reviewSpace({ spaceId: spaceId, decision: "reject", reason: "late" })).toMatchObject({ ok: false });
  });

  it("opens team management once approved, and closes it again when suspended", async () => {
    signIn(users.applicant);
    expect((await createSpaceInvite({ spaceSlug: slug, role: "OPERATOR" })).ok).toBe(true);
    signIn(users.admin);
    expect(await reviewSpace({ spaceId: spaceId, decision: "suspend", reason: "Unpaid hosting invoice." })).toEqual({ ok: true });
    signIn(users.applicant);
    expect((await createSpaceInvite({ spaceSlug: slug, role: "OPERATOR" })).ok).toBe(false);
    signIn(users.admin);
    expect(await reviewSpace({ spaceId: spaceId, decision: "reactivate" })).toEqual({ ok: true });
  });

  it("releases a declined space's address only after 30 days", async () => {
    signIn(users.owner);
    const declinedSlug = `declined-club-${suffix}`;
    expect((await submitSpaceApplication(application({ slug: declinedSlug }))).ok).toBe(true);
    const declined = await prisma.space.findUniqueOrThrow({ where: { slug: declinedSlug } });
    createdSpaceIds.push(declined.id);
    signIn(users.admin);
    expect(await reviewSpace({ spaceId: declined.id, decision: "reject", reason: "Not a space." })).toEqual({ ok: true });

    signIn(users.applicant);
    expect((await submitSpaceApplication(application({ slug: declinedSlug }))).ok).toBe(false);
    await prisma.$executeRaw`UPDATE "Space" SET "updatedAt" = now() - interval '31 days' WHERE "id" = ${declined.id}`;
    const retry = await submitSpaceApplication(application({ slug: declinedSlug }));
    expect(retry).toEqual({ ok: true, data: { slug: declinedSlug } });
    const fresh = await prisma.space.findUniqueOrThrow({ where: { slug: declinedSlug } });
    createdSpaceIds.push(fresh.id);
    expect(fresh.id).not.toBe(declined.id);
    expect((await prisma.space.findUniqueOrThrow({ where: { id: declined.id } })).slug).toBe(`declined-${declined.id}`);
  });
});

describe.sequential("platform admin tools", () => {
  it("creates an active space whose machine manager joins by an email-bound invite", async () => {
    signIn(users.admin);
    const result = await createSpaceForOwner({ ...application({ slug: `direct-${suffix}`, name: "Direct Club" }), ownerEmail: users.owner.email });
    expect(result.ok).toBe(true);
    const spaceId = result.ok ? result.data!.spaceId : "";
    createdSpaceIds.push(spaceId);
    const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, include: { reviews: true, invites: true, members: true } });
    expect(space).toMatchObject({ status: "ACTIVE", source: "SUPERADMIN" });
    expect(space.reviews).toEqual([expect.objectContaining({ action: "CREATED" })]);
    expect(space.members).toEqual([]);
    const [invite] = space.invites;
    expect(invite).toMatchObject({ role: "MACHINE_MANAGER", email: users.owner.email });
    expect((await outboxFor(spaceId)).map((message) => message.kind)).toEqual(["owner-invite"]);

    expect(await acceptSpaceInviteToken(invite.token, { id: users.applicant.id, email: users.applicant.email, emailVerified: true })).toEqual({ ok: false, reason: "wrong-account" });
    expect(await acceptSpaceInviteToken(invite.token, { id: users.owner.id, email: users.owner.email, emailVerified: true })).toEqual({ ok: true, href: `/dashboard/direct-${suffix}` });
    expect(await prisma.spaceMember.findFirst({ where: { spaceId, userId: users.owner.id } })).toMatchObject({ role: "MACHINE_MANAGER" });
  });

});
