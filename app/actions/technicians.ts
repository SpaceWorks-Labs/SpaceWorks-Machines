"use server";

import { prisma } from "@/lib/db";
import { invalid, revalidate, slugOf, staffAction } from "@/lib/actionAccess";
import { technicianCsvSchema, technicianSchema } from "@/lib/repairs/schemas";
import { parseTechnicianCsv, saveTechnician, TechnicianError } from "@/lib/repairs/technicians";
import type { ActionResult } from "./space";

/** The technician directory: the machine manager adds, edits and deactivates technicians (audited). */
export async function saveTechnicianAction(input: unknown): Promise<ActionResult> {
  const access = await staffAction(slugOf(input), "technicians.manage");
  if (!access.ok) return access;
  const parsed = technicianSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await prisma.$transaction((tx) => saveTechnician(tx, { spaceId: access.space.id, actorId: access.userId }, parsed.data));
  } catch (error) {
    if (error instanceof TechnicianError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${access.space.slug}/technicians`);
  return { ok: true };
}

/** Add external technicians from CSV lines (name,email,phone,whatsapp,telegram,skills;…,notes); all or nothing. */
export async function importTechniciansAction(input: unknown): Promise<ActionResult<{ added: number }>> {
  const access = await staffAction(slugOf(input), "technicians.manage");
  if (!access.ok) return access;
  const parsed = technicianCsvSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const rows = parseTechnicianCsv(parsed.data.csv);
  if (!rows.length) return { ok: false, error: "Add at least one line." };
  try {
    await prisma.$transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        try { await saveTechnician(tx, { spaceId: access.space.id, actorId: access.userId }, row); } catch (error) {
          if (error instanceof TechnicianError) throw new TechnicianError(`Line ${index + 1}: ${error.message}`);
          throw error;
        }
      }
    });
  } catch (error) {
    if (error instanceof TechnicianError) return { ok: false, error: error.message };
    throw error;
  }
  revalidate(`/dashboard/${access.space.slug}/technicians`);
  return { ok: true, data: { added: rows.length } };
}
