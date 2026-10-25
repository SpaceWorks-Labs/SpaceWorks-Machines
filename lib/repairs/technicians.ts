import "server-only";
import type { Prisma, TechnicianChannel, TechnicianKind } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";

/**
 * The technician directory (owner decision 2026-10-24): staff technicians, linked to a TECHNICIAN on the
 * space's staff, and external contacts. The machine manager adds, edits and deactivates them; every save is
 * audited. Rows are never deleted, so a fault's history keeps its technician.
 */
export class TechnicianError extends Error {}

export type TechnicianInput = {
  technicianId?: string; kind: TechnicianKind; userId?: string | null; name: string; email?: string; phone?: string; whatsapp?: string;
  telegramChatId?: string; skills?: string[]; preferredChannel?: TechnicianChannel; notes?: string; isActive?: boolean;
};

const clean = (value: string | undefined, max: number) => (value ?? "").trim().slice(0, max);

export function cleanSkills(skills: string[] | undefined) {
  return [...new Set((skills ?? []).map((skill) => skill.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))].slice(0, 20);
}

export async function saveTechnician(tx: Prisma.TransactionClient, actor: { spaceId: string; actorId: string }, input: TechnicianInput) {
  const existing = input.technicianId ? await tx.technician.findFirst({ where: { spaceId: actor.spaceId, id: input.technicianId } }) : null;
  if (input.technicianId && !existing) throw new TechnicianError("Technician not found.");
  const kind = existing?.kind ?? input.kind;
  let userId: string | null = existing?.userId ?? null;
  let name = clean(input.name, 120), email = clean(input.email, 320).toLowerCase();
  if (kind === "STAFF") {
    userId = existing?.userId ?? input.userId ?? null;
    const member = userId ? await tx.spaceMember.findFirst({ where: { spaceId: actor.spaceId, userId, status: "ACTIVE", role: "TECHNICIAN" },
      select: { user: { select: { name: true, email: true } } } }) : null;
    if (!member) throw new TechnicianError("Pick a technician on this space's staff.");
    name ||= member.user.name ?? "";
    email = member.user.email ?? email;
  }
  if (!name) throw new TechnicianError("Give the technician a name.");
  const whatsapp = clean(input.whatsapp, 20).replace(/[\s-]/g, "");
  const telegramChatId = clean(input.telegramChatId, 40);
  if (whatsapp && !/^\+?[1-9]\d{7,14}$/.test(whatsapp)) throw new TechnicianError("Use the WhatsApp number with its country code.");
  if (telegramChatId && !/^-?\d{3,20}$/.test(telegramChatId)) throw new TechnicianError("Use the numeric Telegram chat ID.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TechnicianError("Enter a valid email address.");
  if (kind === "EXTERNAL" && !email && !whatsapp && !telegramChatId) throw new TechnicianError("Add an email, a WhatsApp number or a Telegram chat ID so requests can reach them.");
  const data = { name, email, phone: clean(input.phone, 30), whatsapp, telegramChatId, skills: cleanSkills(input.skills),
    preferredChannel: input.preferredChannel ?? "EMAIL", notes: clean(input.notes, 1000), isActive: input.isActive ?? true };
  try {
    const saved = existing
      ? await tx.technician.update({ where: { id: existing.id }, data })
      : await tx.technician.create({ data: { ...data, spaceId: actor.spaceId, kind, userId, createdById: actor.actorId } });
    await recordAuditEvent({ action: existing ? "technician.updated" : "technician.added", actorUserId: actor.actorId, spaceId: actor.spaceId,
      targetType: "Technician", targetId: saved.id, metadata: { kind, active: saved.isActive }, client: tx });
    return saved;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new TechnicianError("That staff member is already in the directory.");
    throw error;
  }
}

/** Parse "name,email,phone,whatsapp,telegram,skills;separated,notes" lines into external technicians. */
export function parseTechnicianCsv(text: string): TechnicianInput[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^name\s*,/i.test(line)).slice(0, 200).map((line) => {
    const [name = "", email = "", phone = "", whatsapp = "", telegramChatId = "", skills = "", notes = ""] = line.split(",").map((cell) => cell.trim());
    return { kind: "EXTERNAL" as const, name, email, phone, whatsapp, telegramChatId, skills: skills.split(";"), notes };
  });
}
