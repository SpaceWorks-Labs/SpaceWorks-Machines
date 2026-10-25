import type { PricingAudience, PricingRule } from "@prisma/client";

export class PublicPricingUnavailableError extends Error {
  constructor() { super("This service is not offered to the public. Join the space to request it."); }
}

export type RuleScope = Pick<PricingRule, "spaceId" | "typeId" | "machineId" | "audience">;

/** Look through every PUBLIC level before considering any MEMBER fallback. Null means FREE. */
export function resolvePricingRule<T extends RuleScope>(rules: readonly T[], input: {
  spaceId: string; typeId: string; machineId?: string | null; audience: PricingAudience;
  paymentsEnabled: boolean; publicUsesMemberRates: boolean;
}): T | null {
  if (!input.paymentsEnabled) return null;
  const scoped = rules.filter((r) => r.spaceId === input.spaceId &&
    (r.machineId ? r.machineId === input.machineId : r.typeId ? r.typeId === input.typeId : true));
  const find = (audience: PricingAudience) => {
    const candidates = scoped.filter((r) => r.audience === audience);
    return candidates.find((r) => r.machineId && r.machineId === input.machineId)
      ?? candidates.find((r) => !r.machineId && r.typeId === input.typeId)
      ?? candidates.find((r) => !r.typeId && !r.machineId) ?? null;
  };
  const own = find(input.audience);
  if (own || input.audience === "MEMBER") return own;
  if (input.publicUsesMemberRates) return find("MEMBER");
  if (find("MEMBER")) throw new PublicPricingUnavailableError();
  return null;
}
