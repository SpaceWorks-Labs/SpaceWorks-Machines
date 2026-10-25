"use server";

import { isIP } from "node:net";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { requireSuperAdmin } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { unblockIp } from "@/lib/ipBlock";
import type { ActionResult } from "./space";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

/** A super admin lifts an automatic sign-in block on an address. */
export async function unblockAddress(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const ip = typeof input === "object" && input && "ip" in input && typeof input.ip === "string" ? input.ip.trim() : "";
  if (!isIP(ip)) return { ok: false, error: "That isn't an address." };
  await unblockIp(ip);
  await recordAuditEvent({ action: "IP_UNBLOCKED", actorUserId: session.user.id, targetType: "Address", targetId: ip });
  revalidatePath("/super-admin/security");
  return { ok: true };
}
