import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { asRecord, isBoundedString, isEmail } from "@/lib/outboxPayload";
import { absoluteUrl, sendBrandedEmail } from "./message";

export const UPKEEP_EMAIL_EVENTS = ["maintenance-due", "fault-reported", "fault-fixed", "fault-resolved", "warranty-expiring"] as const;
export type UpkeepEmailEvent = typeof UPKEEP_EMAIL_EVENTS[number];
type UpkeepEmailPayload = { to: string; spaceId: string; machineId: string; event: UpkeepEmailEvent; refId?: string };

export function asUpkeepEmailPayload(value: Prisma.JsonValue): UpkeepEmailPayload | null {
  const p = asRecord(value);
  if (!p || !isEmail(p.to) || !isBoundedString(p.spaceId, 128) || !isBoundedString(p.machineId, 128) ||
    !UPKEEP_EMAIL_EVENTS.includes(p.event as UpkeepEmailEvent) || (p.refId !== undefined && !isBoundedString(p.refId, 128))) return null;
  return p as UpkeepEmailPayload;
}

/** Staff alert, built at send time from the rows as they are now; dropped when the reason has gone. */
export async function deliverUpkeepEmail(payload: UpkeepEmailPayload, messageId: string): Promise<"sent" | "dropped"> {
  const machine = await prisma.machine.findFirst({ where: { id: payload.machineId, spaceId: payload.spaceId },
    select: { name: true, slug: true, space: { select: { name: true, slug: true } } } });
  if (!machine) return "dropped";
  const machineUrl = absoluteUrl(`/dashboard/${machine.space.slug}/machines/${machine.slug}`);
  const send = (subject: string, heading: string, paragraphs: string[], label: string, url = machineUrl) =>
    sendBrandedEmail({ to: payload.to, messageId, subject: `${machine.space.name}: ${subject}`, heading, paragraphs, action: { label, url } }).then(() => "sent" as const);

  if (payload.event === "maintenance-due") {
    const schedule = payload.refId ? await prisma.maintenanceSchedule.findFirst({ where: { id: payload.refId, spaceId: payload.spaceId, isActive: true }, select: { title: true } }) : null;
    if (!schedule) return "dropped";
    return send(`${schedule.title} is due`, "Maintenance due", [`${schedule.title} on ${machine.name} is due or overdue.`,
      "Log the maintenance when it's done; the schedule moves on to its next due point."], "Open the machine");
  }
  if (payload.event === "fault-reported" || payload.event === "fault-resolved" || payload.event === "fault-fixed") {
    const fault = payload.refId ? await prisma.faultReport.findFirst({ where: { id: payload.refId, spaceId: payload.spaceId }, select: { number: true, title: true, severity: true, status: true } }) : null;
    if (!fault) return "dropped";
    const label = `F-${String(fault.number).padStart(4, "0")}`;
    const url = absoluteUrl(`/dashboard/${machine.space.slug}/maintenance/faults/${fault.number}`);
    if (payload.event === "fault-fixed") {
      if (fault.status !== "FIXED") return "dropped";
      return send(`repair ${label} is ready to check`, "Repair marked fixed", [`The technician marked ${label} on ${machine.name} fixed. Check it and close it, or reopen it.`], "Check the repair", url);
    }
    return payload.event === "fault-reported"
      ? send(`fault ${label} on ${machine.name}`, "Fault reported", [`${label} (${fault.severity.toLowerCase()}): ${fault.title}`], "Open the fault", url)
      : send(`fault ${label} closed`, "Fault closed", [`${label} on ${machine.name} is ${fault.status === "WONT_FIX" ? "closed without a fix" : "resolved"}.`], "Open the fault", url);
  }
  if (payload.event === "warranty-expiring") {
    const warranty = await prisma.warranty.findFirst({ where: { machineId: payload.machineId, spaceId: payload.spaceId }, select: { expiresOn: true, vendorName: true } });
    if (!warranty?.expiresOn) return "dropped";
    return send(`warranty for ${machine.name} is expiring`, "Warranty expiring", [
      `The warranty${warranty.vendorName ? ` from ${warranty.vendorName}` : ""} for ${machine.name} ends on ${warranty.expiresOn.toISOString().slice(0, 10)}.`,
      "Renew it or plan for repairs outside warranty."], "Open the machine");
  }
  return "dropped";
}
