import "server-only";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { can, isStaffRole } from "@/lib/permissionRoles";
import { JOB_DEFAULTS } from "./settingsDefaults";
import { readFields } from "@/lib/machines/fields";
import { readFilePolicy } from "@/lib/machines/filePolicy";
import { calculatePrice, resolvePricingRule, PublicPricingUnavailableError } from "@/lib/pricing";

export async function intakeOptions(spaceId: string, onBehalf = false) {
  const session = await auth();
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id } }) : null;
  const member = user ? await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId } } }) : null;
  const settings = await prisma.spaceJobSettings.findUnique({ where: { spaceId } }) ?? JOB_DEFAULTS;
  const staff = member?.status === "ACTIVE" && can(member.role, "jobs.review");
  const audience = member?.status === "ACTIVE" ? "MEMBER" as const : "PUBLIC" as const;
  let unavailable = !user ? "Sign in to request a job." : !user.emailVerified ? "Verify your email before requesting a job." :
    member?.status === "BLOCKED" ? "You are blocked from requesting jobs in this space." :
    isStaffRole(member?.role) && !user.mfaEnabledAt ? "Set up an authenticator before managing jobs." :
    !settings.jobsEnabled ? "This space is not accepting jobs." :
    settings.eligibility === "STAFF_ONLY" && !staff ? "Staff submit requests on your behalf. Contact the space." :
    settings.eligibility === "MEMBERS_ONLY" && audience !== "MEMBER" ? "Join this space before requesting a job." : "";
  if (onBehalf && !staff) unavailable = "Your role doesn't allow this.";
  const [types, machines, rules] = await Promise.all([
    prisma.machineType.findMany({ where: { spaceId, archivedAt: null, acceptsJobs: true }, orderBy: { sortOrder: "asc" } }),
    prisma.machine.findMany({ where: { spaceId, retiredAt: null, acceptsJobs: true }, select: { id: true, name: true, typeId: true } }),
    prisma.pricingRule.findMany({ where: { spaceId } }),
  ]);
  return { unavailable, audience, staff, settings: { paymentsEnabled: settings.paymentsEnabled, publicUsesMemberRates: settings.publicUsesMemberRates,
    taxRateBps: settings.taxRateBps, taxInclusive: settings.taxInclusive, taxLabel: settings.taxLabel },
    types: types.map((t) => ({ id: t.id, name: t.name, requesterPicksMachine: t.requesterPicksMachine,
      requestFields: readFields(t.requestFields), materials: t.materials, colours: t.colours, filePolicy: readFilePolicy(t.filePolicy) })),
    machines, rules: rules.map((r) => ({ ...r, materialRate: r.materialRate.toString(), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
  };
}

export async function canRequestMachine(spaceId: string, typeId: string, machineId: string) {
  const intake = await intakeOptions(spaceId);
  const type = intake.types.find((t) => t.id === typeId);
  if (intake.unavailable || !type || !intake.machines.some((m) => m.id === machineId)) return false;
  try {
    const rule = resolvePricingRule(intake.rules, { spaceId, typeId, machineId: type.requesterPicksMachine ? machineId : undefined, audience: intake.audience, ...intake.settings });
    if (!rule || ["FREE", "FLAT"].includes(rule.mode)) calculatePrice(rule, intake.settings);
    return true;
  } catch (error) { if (error instanceof PublicPricingUnavailableError) return false; throw error; }
}
