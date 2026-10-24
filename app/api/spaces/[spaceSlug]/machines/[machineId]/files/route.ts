import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { spaceActionAccess } from "@/lib/permissions";
import { typeWhere } from "@/lib/typeScope";
import { checkRateLimitById } from "@/lib/rateLimit";
import { isSameOriginRequest } from "@/lib/net/sameOrigin";
import { addMachineDocument, addMachinePhoto } from "@/lib/machines/files";
import { MachineInputError, MachineNotFoundError } from "@/lib/machines/machines";
import { documentMetaSchema, photoMetaSchema } from "@/lib/machines/schemas";
import { prepareDocument, preparePhoto } from "@/lib/machines/uploads";
import { deleteMachineFiles, MACHINE_FILE_TYPES, machineFileKey, uploadMachineFile } from "@/lib/storage/machineFiles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ spaceSlug: string; machineId: string }> };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Upload a machine photo (kind=photo) or document (kind=document) as multipart form data. A route handler, not
 * a server action, because documents run to 20 MB. Same checks as every machine action: signed-in active staff
 * with machines.manage in an active space, plus a same-origin check and an upload rate limit.
 */
export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Not found." }, 404);
  const { spaceSlug, machineId } = await params;
  const access = await spaceActionAccess(spaceSlug, "machines.manage");
  if (!access.ok) return json({ ok: false, error: access.error }, access.error === "Space not found." ? 404 : 403);
  if (!(await checkRateLimitById("machineUpload", `user:${access.userId}`))) return json({ ok: false, error: "Too many uploads. Try again later." }, 429);

  const machine = await prisma.machine.findFirst({ where: { id: machineId, spaceId: access.space.id, ...typeWhere(access.typeScope) }, select: { id: true } });
  if (!machine) return json({ ok: false, error: "Machine not found." }, 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "Choose a file to upload." }, 400);
  }
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "photo" && kind !== "document")) return json({ ok: false, error: "Choose a file to upload." }, 400);

  const meta = kind === "photo"
    ? photoMetaSchema.safeParse({ alt: String(form.get("alt") ?? "") })
    : documentMetaSchema.safeParse({ title: String(form.get("title") ?? ""), kind: String(form.get("documentKind") ?? "MANUAL"), isPublic: form.get("isPublic") === "true" });
  if (!meta.success) return json({ ok: false, error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(meta.error.issues.map((issue) => [issue.path.join("."), [issue.message]])) }, 400);

  const prepared = kind === "photo" ? await preparePhoto(file) : await prepareDocument(file);
  if ("error" in prepared) return json({ ok: false, error: prepared.error }, 400);

  const key = machineFileKey(access.space.id, machine.id, kind === "photo" ? "photos" : "documents", prepared.extension);
  try {
    await uploadMachineFile(key, prepared.body);
  } catch {
    console.error("[machines] file upload failed");
    return json({ ok: false, error: "Couldn't store the file. Try again." }, 500);
  }
  try {
    const created = await prisma.$transaction((tx) => {
      if (kind === "photo") {
        const data = meta.data as { alt: string };
        return addMachinePhoto(tx, { spaceId: access.space.id, machineId: machine.id, actorId: access.userId, storageKey: key, alt: data.alt, width: prepared.width, height: prepared.height });
      }
      const data = meta.data as { title: string; kind: "MANUAL" | "SOP" | "SAFETY" | "DATASHEET" | "OTHER"; isPublic: boolean };
      return addMachineDocument(tx, {
        spaceId: access.space.id, machineId: machine.id, actorId: access.userId, storageKey: key, title: data.title, kind: data.kind, isPublic: data.isPublic,
        filename: prepared.filename, contentType: MACHINE_FILE_TYPES[prepared.extension], sizeBytes: prepared.sizeBytes,
      });
    });
    return json({ ok: true, id: created.id });
  } catch (error) {
    await deleteMachineFiles([key]).catch(() => undefined);
    if (error instanceof MachineInputError) return json({ ok: false, error: error.fieldErrors.file?.[0] ?? error.message }, 400);
    if (error instanceof MachineNotFoundError) return json({ ok: false, error: "Machine not found." }, 404);
    throw error;
  }
}
