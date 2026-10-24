import type { SpaceMember, SpaceStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Session } from "next-auth";
import { scopeForRole, type TypeScope } from "@/lib/typeScope";

/** A person's row in a space (staff or maker), whatever its status. */
export async function getMembership(userId: string, spaceId: string): Promise<SpaceMember | null> {
  return prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId, spaceId } } });
}

/** Read from the database for mutation gates; session JWTs can be stale. */
export async function isUserEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  return user?.emailVerified != null;
}

export async function requireAuth(): Promise<Session & { user: { id: string; }; }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session as Session & { user: { id: string; }; };
}

/**
 * Instance-wide super-admin gate: a verified user flagged `isSuperAdmin`. Super admins are created and their
 * passwords set only on the server (`docker/ops/admin.mjs`). Anyone else gets notFound(), so the panel's
 * existence is never revealed.
 */
export async function requireSuperAdmin(): Promise<Session & { user: { id: string; email: string; }; }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true, isSuperAdmin: true } });
  const userEmail = user?.email;
  if (!userEmail || !user.emailVerified) notFound();
  if (!user.isSuperAdmin) notFound();
  return { ...session, user: { ...session.user, id: session.user.id, email: userEmail } } as Session & { user: { id: string; email: string; }; };
}

export type SpaceAccessContext = {
  space: { id: string; slug: string; name: string; status: SpaceStatus; };
  membership: SpaceMember;
  userId: string;
  /** Machine types a TYPE_MANAGER may act on; null = every type (lib/typeScope.ts). */
  typeScope: TypeScope;
};

const SPACE_SELECT = { id: true, slug: true, name: true, status: true } as const;

/** Active staff only: a maker (MEMBER) or a pending or blocked row never opens the dashboard. */
function isActiveStaff(membership: SpaceMember | null): membership is SpaceMember {
  return membership != null && membership.status === "ACTIVE" && isStaffRole(membership.role);
}

/**
 * Staff access to a space, whatever its status. Use only for the application page and other screens that
 * must work before approval; everything else goes through requireSpaceCapability. Anyone who isn't active
 * staff of this space gets a 404, so a space's dashboard never confirms the space exists.
 */
export async function requireSpaceTeam(spaceSlug: string): Promise<SpaceAccessContext> {
  const session = await requireAuth();
  const space = await prisma.space.findUnique({ where: { slug: spaceSlug }, select: SPACE_SELECT });
  if (!space) notFound();
  const membership = await getMembership(session.user.id, space.id);
  if (!isActiveStaff(membership)) notFound();
  if (!(await hasAuthenticator(session.user.id))) redirect(STAFF_AUTHENTICATOR_SETUP);
  return { space, membership, userId: session.user.id, typeScope: await scopeForRole(prisma, space.id, session.user.id, membership.role) };
}

/** Staff (any role except MEMBER) must use an authenticator app; makers and super admins need not. */
export async function hasAuthenticator(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabledAt: true } });
  return Boolean(user?.mfaEnabledAt);
}

/** Any active staff member may open the space dashboard; what they see is gated by capability. */
export async function requireSpaceDashboardAccess(spaceSlug: string): Promise<SpaceAccessContext> {
  const access = await requireSpaceTeam(spaceSlug);
  if (access.space.status !== "ACTIVE" && !spaceAllows(access.space.status, "space.view")) redirect(`/dashboard/${spaceSlug}/application`);
  return access;
}

/** Staff access for one capability, honouring the space's status (a suspended space keeps read access). */
export async function requireSpaceCapability(spaceSlug: string, capability: Capability): Promise<SpaceAccessContext> {
  const access = await requireSpaceTeam(spaceSlug);
  if (!spaceAllows(access.space.status, capability)) redirect(`/dashboard/${spaceSlug}/application`);
  if (!can(access.membership.role, capability)) redirect(`/dashboard/${spaceSlug}`);
  return access;
}

export type SpaceActionAccess =
  | { ok: true; space: SpaceAccessContext["space"]; membership: SpaceMember; userId: string; typeScope: TypeScope }
  | { ok: false; error: string };

/**
 * The server-action counterpart of requireSpaceCapability: returns an error instead of redirecting, so
 * every action applies the same tenant, status, role and authenticator checks before touching data.
 */
export async function spaceActionAccess(spaceSlug: unknown, capability: Capability): Promise<SpaceActionAccess> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (typeof spaceSlug !== "string" || !spaceSlug) return { ok: false, error: "Space not found." };
  const space = await prisma.space.findUnique({ where: { slug: spaceSlug }, select: SPACE_SELECT });
  if (!space) return { ok: false, error: "Space not found." };
  const membership = await getMembership(session.user.id, space.id);
  if (!isActiveStaff(membership)) return { ok: false, error: "Space not found." };
  if (!spaceAllows(space.status, capability)) {
    return { ok: false, error: space.status === "SUSPENDED" ? "This space is suspended, so this can't be changed right now." : "This space isn't approved yet." };
  }
  if (!can(membership.role, capability)) return { ok: false, error: "Your role doesn't allow this." };
  if (!(await hasAuthenticator(session.user.id))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  return { ok: true, space, membership, userId: session.user.id, typeScope: await scopeForRole(prisma, space.id, session.user.id, membership.role) };
}

export { can, hasRoleAtLeast, isSpaceManager, isStaffRole, canManageTeam, canManageTeamMember, canDeleteSpace, spaceAllows, STAFF_AUTHENTICATOR_MESSAGE, STAFF_AUTHENTICATOR_SETUP } from "@/lib/permissionRoles";

import { can, isStaffRole, spaceAllows, STAFF_AUTHENTICATOR_MESSAGE, STAFF_AUTHENTICATOR_SETUP, type Capability } from "./permissionRoles";
