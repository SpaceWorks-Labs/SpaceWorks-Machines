"use server";

import { z } from "zod";
import { invalid, slugOf, staffAction } from "@/lib/actionAccess";
import { prisma } from "@/lib/db";
import { transitionJob } from "@/lib/jobs";
import { transitionSchema } from "@/lib/jobs/actionSchemas";
import { jobFailure, refreshJobs, requesterAction, submitAction } from "@/lib/jobs/actionSupport";
import type { ActionResult } from "./space";
import { printerDependencies } from "@/lib/printers/jobs";

export async function submitJobAction(input: unknown) { return submitAction(input); }
export async function createJobOnBehalfAction(input: unknown) {
  const access = await staffAction(slugOf(input), "jobs.review");
  if (!access.ok) return access;
  const parsed = z.object({ requesterEmail: z.email().max(254) }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return submitAction(input);
}

/** All commands are validated before entering the domain's locked transition transaction. */
export async function transitionJobAction(input: unknown): Promise<ActionResult<{ number: number; warnings: string[] }>> {
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { command, jobId } = parsed.data;
  const personal = command.kind === "cancel" || (command.kind === "note" && !command.internal);
  const review = ["approve", "reject", "reprint", "priority", "reassign", "note"].includes(command.kind);
  const access = personal ? await requesterAction(input) : await staffAction(slugOf(input), review ? "jobs.review" : "jobs.operate");
  if (!access.ok) return access;
  const job = await prisma.job.findFirst({ where: { spaceId: access.space.id, id: jobId }, select: { requesterId: true } });
  if (!job) return { ok: false, error: "Space not found." };
  if (personal && job.requesterId !== access.userId) {
    const staff = await staffAction(slugOf(input), "jobs.review");
    if (!staff.ok) return staff;
  }
  try {
    const result = await transitionJob({ spaceId: access.space.id, actorId: access.userId, jobId }, command, printerDependencies);
    refreshJobs(access.space.slug);
    return { ok: true, data: { number: result.job.number, warnings: result.warnings } };
  } catch (error) { return jobFailure(error); }
}
