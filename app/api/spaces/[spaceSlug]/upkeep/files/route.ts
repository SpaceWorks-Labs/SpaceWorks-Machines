import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { spaceActionAccess } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { isSameOriginRequest } from "@/lib/net/sameOrigin";
import { prepareDocument, preparePhoto } from "@/lib/machines/uploads";
import { deleteMachineFiles, MACHINE_FILE_TYPES, machineFileKey, uploadMachineFile } from "@/lib/storage/machineFiles";
import { addFaultPhoto, addMaintenanceAttachment, addWarrantyDocument, UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ spaceSlug: string }> };
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const REPORTER_WINDOW_MS = 24 * 3_600_000;

/** Who uploads: maintenance managers for everything; a fault's reporter may add photos to it within a day. */
async function uploader(spaceSlug: string, kind: string, targetId: string) {
  const staff = await spaceActionAccess(spaceSlug, "maintenance.manage");
  if (staff.ok) return { spaceId: staff.space.id, userId: staff.userId };
  if (kind !== "fault") return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  const space = await prisma.space.findUnique({ where: { slug: spaceSlug }, select: { id: true, status: true } });
  if (!space || space.status !== "ACTIVE") return null;
  const fault = await prisma.faultReport.findFirst({ where: { spaceId: space.id, id: targetId, reportedById: session.user.id }, select: { spaceId: true, createdAt: true } });
  if (!fault || Date.now() - fault.createdAt.getTime() > REPORTER_WINDOW_MS) return null;
  const member = await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId: session.user.id, spaceId: fault.spaceId } }, select: { status: true } });
  return member?.status === "ACTIVE" ? { spaceId: fault.spaceId, userId: session.user.id } : null;
}

/** The machine a target belongs to (for the tenant-prefixed key), or null when it isn't in this space. */
async function machineOf(spaceId: string, kind: string, targetId: string) {
  if (kind === "maintenance") return (await prisma.maintenanceLog.findFirst({ where: { spaceId, id: targetId }, select: { machineId: true } }))?.machineId ?? null;
  if (kind === "warranty") return (await prisma.warranty.findFirst({ where: { spaceId, machineId: targetId }, select: { machineId: true } }))?.machineId ?? null;
  return (await prisma.faultReport.findFirst({ where: { spaceId, id: targetId }, select: { machineId: true } }))?.machineId ?? null;
}

/**
 * Multipart upload of a maintenance attachment (kind=maintenance, targetId=log id), a warranty document
 * (kind=warranty, targetId=machine id) or a fault photo (kind=fault, targetId=fault id). Files are validated,
 * re-encoded where they are images, and stored privately.
 */
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Not found." }, 404);
  const { spaceSlug } = await params;
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "Choose a file to upload." }, 400); }
  const kind = String(form.get("kind") ?? "");
  const targetId = String(form.get("targetId") ?? "").slice(0, 64);
  const file = form.get("file");
  if (!["maintenance", "warranty", "fault"].includes(kind) || !targetId || !(file instanceof File)) return json({ ok: false, error: "Choose a file to upload." }, 400);
  const who = await uploader(spaceSlug, kind, targetId);
  if (!who) return json({ ok: false, error: "Not found." }, 404);
  if (!(await checkRateLimitById("machineUpload", `user:${who.userId}`))) return json({ ok: false, error: "Too many uploads. Try again later." }, 429);
  const machineId = await machineOf(who.spaceId, kind, targetId);
  if (!machineId) return json({ ok: false, error: "Not found." }, 404);

  const prepared = kind === "fault" ? await preparePhoto(file) : await prepareDocument(file);
  if ("error" in prepared) return json({ ok: false, error: prepared.error }, 400);
  const key = machineFileKey(who.spaceId, machineId, kind === "fault" ? "faults" : kind as "maintenance" | "warranty", prepared.extension);
  try {
    await uploadMachineFile(key, prepared.body);
  } catch {
    console.error("[upkeep] file upload failed");
    return json({ ok: false, error: "Couldn't store the file. Try again." }, 500);
  }
  const actor = { spaceId: who.spaceId, actorId: who.userId };
  const meta = { storageKey: key, filename: prepared.filename, contentType: MACHINE_FILE_TYPES[prepared.extension], sizeBytes: prepared.sizeBytes };
  try {
    const created: { id: string } = await prisma.$transaction(async (tx) => kind === "maintenance" ? addMaintenanceAttachment(tx, actor, { ...meta, logId: targetId })
      : kind === "warranty" ? addWarrantyDocument(tx, actor, { ...meta, machineId })
        : addFaultPhoto(tx, actor, { faultId: targetId, storageKey: key }));
    return json({ ok: true, id: created.id });
  } catch (error) {
    await deleteMachineFiles([key]).catch(() => undefined);
    if (error instanceof UpkeepNotFoundError) return json({ ok: false, error: "Not found." }, 404);
    if (error instanceof UpkeepError) return json({ ok: false, error: error.message }, 400);
    throw error;
  }
}
