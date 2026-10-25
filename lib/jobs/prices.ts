import "server-only";
import type { Job, Prisma, SpaceJobSettings } from "@prisma/client";
import { calculatePrice, resolvePricingRule, type PriceRule } from "@/lib/pricing";
import { JobGuardError } from "./context";

/** JSON-safe rule snapshot is kept with the breakdown, so final pricing survives later rate edits. */
export async function quoteJob(tx: Prisma.TransactionClient, job: Pick<Job, "spaceId" | "typeId" | "machineId" | "audience" | "currency"> & { assignedMachineId?: string | null },
  settings: SpaceJobSettings, minutes?: number | null, quantity?: string | null, overrideTotal?: number) {
  const rules = await tx.pricingRule.findMany({ where: { spaceId: job.spaceId } });
  const rule = resolvePricingRule(rules, { ...job, ...settings, machineId: job.assignedMachineId ?? job.machineId });
  if (rule && overrideTotal == null) {
    const space = await tx.space.findUniqueOrThrow({ where: { id: job.spaceId }, select: { currency: true } });
    if (space.currency !== job.currency) throw new JobGuardError("The pricing currency differs from the job currency. Set a price override in the job currency or re-submit the job.");
  }
  const timing = rule?.paymentTiming ?? settings.defaultPaymentTiming;
  if (timing === "PAY_LATER" && !settings.allowPayLater) throw new JobGuardError("Pay later is not available in this space.");
  if (!settings.paymentsEnabled && overrideTotal) throw new JobGuardError("Payments are disabled in this space.");
  // An explicit quote override is an agreed total, with its tax portion included in that amount.
  const snapshot = overrideTotal == null ? calculatePrice(rule, { minutes, quantity, ...settings }) :
    calculatePrice({ mode: "FLAT", flatFee: overrideTotal }, { ...settings, taxInclusive: true });
  return { quotedAmount: snapshot.total, paymentTiming: timing, pricingSnapshot: {
    ...snapshot, rule: rule ? { mode: rule.mode, flatFee: rule.flatFee, timeRatePerHour: rule.timeRatePerHour,
      materialRate: rule.materialRate.toString(), setupFee: rule.setupFee, minimumCharge: rule.minimumCharge,
      timeIncrementMinutes: rule.timeIncrementMinutes, depositMode: rule.depositMode, depositValue: rule.depositValue } : { mode: "FREE" as const },
  } };
}

export function finalPrice(job: Job, minutes: number, quantity: string) {
  const saved = job.pricingSnapshot as unknown as { rule: PriceRule; taxRateBps: number; taxInclusive: boolean; taxLabel: string } | null;
  if (!saved?.rule) throw new JobGuardError("Approve a price before running this job.");
  const calculated = job.priceOverrideReason
    ? calculatePrice({ mode: "FLAT", flatFee: job.quotedAmount! }, { ...saved, taxInclusive: true })
    : calculatePrice(saved.rule, { ...saved, minutes, quantity });
  return { finalAmount: calculated.total, pricingSnapshot: { ...saved, final: calculated } as Prisma.InputJsonObject };
}
