import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isSameOriginRequest } from "@/lib/net/sameOrigin";
import { checkRateLimitById } from "@/lib/rateLimit";
import { preparePhoto } from "@/lib/machines/uploads";
import { deleteMachineFiles, machineFileKey, uploadMachineFile } from "@/lib/storage/machineFiles";
import { requestForToken } from "@/lib/repairs/requests";
import { addFaultPhoto, UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const GONE = { ok: false, error: "This link has expired or is no longer valid." };

/** A photo of the fix from an external technician's link, once they have accepted the repair. Stored privately. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOriginRequest(request)) return json(GONE, 404);
  const { token } = await params;
  if (!(await checkRateLimitById("repairLink", `photo:${token.slice(0, 16)}`))) return json({ ok: false, error: "Too many uploads. Try again later." }, 429);
  const link = await requestForToken(prisma, token);
  if (!link || link.status !== "ACCEPTED" || link.fault.status === "FIXED") return json(GONE, 404);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "Choose a photo to upload." }, 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "Choose a photo to upload." }, 400);
  const prepared = await preparePhoto(file);
  if ("error" in prepared) return json({ ok: false, error: prepared.error }, 400);
  const key = machineFileKey(link.spaceId, link.fault.machineId, "faults", prepared.extension);
  try { await uploadMachineFile(key, prepared.body); } catch { return json({ ok: false, error: "Couldn't store the photo. Try again." }, 500); }
  try {
    const created = await prisma.$transaction((tx) => addFaultPhoto(tx, { spaceId: link.spaceId, actorId: null }, { faultId: link.faultId, storageKey: key, stage: "FIX" }));
    return json({ ok: true, id: created.id });
  } catch (error) {
    await deleteMachineFiles([key]).catch(() => undefined);
    if (error instanceof UpkeepNotFoundError) return json(GONE, 404);
    if (error instanceof UpkeepError) return json({ ok: false, error: error.message }, 400);
    throw error;
  }
}
