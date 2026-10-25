import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import { requestForToken } from "@/lib/repairs/requests";
import { faultNumber } from "@/lib/upkeep/labels";

/**
 * An external technician's request link. The page shows only what the repair needs: the space and machine
 * names, the fault, and the technician's own fix, amount asked and paid status. Nothing else is reachable.
 */
export async function loadRepairLinkView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await requestForToken(prisma, token);
  if (!request) notFound();
  const { fault } = request;
  const currency = fault.machine.space.currency;
  const photos = await prisma.faultPhoto.count({ where: { spaceId: fault.spaceId, faultId: fault.id, stage: "FIX" } });
  return {
    token, status: request.status, expiresAt: request.expiresAt.toISOString(), technician: request.technician.name,
    space: fault.machine.space.name, machine: fault.machine.name, currency,
    fault: { label: faultNumber(fault.number), title: fault.title, description: fault.description, severity: fault.severity, status: fault.status,
      reopenReason: fault.status === "IN_PROGRESS" ? fault.reopenReason : "" },
    fix: { remarks: fault.fixRemarks, parts: fault.fixParts, fixPhotos: photos,
      amountAsked: fault.amountAsked === null ? "" : isCurrencyCode(currency) ? toInputValue(fault.amountAsked, currency) : String(fault.amountAsked),
      approved: fault.approvedAmount !== null, payoutStatus: fault.payoutStatus },
  };
}
