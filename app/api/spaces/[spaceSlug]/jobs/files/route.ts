import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/net/sameOrigin";
import { requesterAction, submitAction } from "@/lib/jobs/actionSupport";
import { prisma } from "@/lib/db";
import { readFilePolicy } from "@/lib/machines/filePolicy";
import { validateJobFiles } from "@/lib/files";
import { readJobMultipart } from "@/lib/files/multipart";
import { GATEWAY_HEADER, isFrontendPeer } from "@/lib/frontend/peer";
import { checkRateLimitById } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Multipart submission keeps files out of the server-action payload and commits them with the job. */
export async function POST(request: Request, { params }: { params: Promise<{ spaceSlug: string }> }) {
  // This large-body route bypasses the Next proxy's body clone; authenticate the frontend peer here.
  if (request.headers.has(GATEWAY_HEADER) && !isFrontendPeer(request.headers)) return json({ ok: false, error: "Not found." }, 404);
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Not found." }, 404);
  const { spaceSlug } = await params;
  const access = await requesterAction({ spaceSlug });
  if (!access.ok) return json(access, access.error === "Space not found." ? 404 : 403);
  if (!await checkRateLimitById("create", `job-upload:${access.space.id}:${access.userId}`)) return json({ ok: false, error: "Too many uploads. Try again later." }, 429);
  const typeId = new URL(request.url).searchParams.get("typeId");
  const type = typeId ? await prisma.machineType.findFirst({ where: { spaceId: access.space.id, id: typeId } }) : null;
  if (!type) return json({ ok: false, error: "Space not found." }, 404);
  const policy = readFilePolicy(type.filePolicy);
  let form: FormData;
  try { form = await readJobMultipart(request, policy.maxBytes, policy.maxFiles); } catch { return json({ ok: false, error: "Check the files and this type's upload limits, then submit again." }, 400); }
  let values: Record<string, unknown>;
  try { values = JSON.parse(String(form.get("values"))); } catch { return json({ ok: false, error: "Check the request fields." }, 400); }
  if (values?.typeId !== type.id) return json({ ok: false, error: "Space not found." }, 404);
  const files = form.getAll("files");
  if (files.length > policy.maxFiles || files.some((f) => !(f instanceof File) || f.size > policy.maxBytes)) return json({ ok: false, error: "The files exceed this type's count or size limit." }, 400);
  const uploads = await Promise.all((files as File[]).map(async (file) => ({ filename: file.name, body: new Uint8Array(await file.arrayBuffer()) })));
  try { validateJobFiles(uploads, policy); } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Check the files." }, 400); }
  const result = await submitAction({ ...values, spaceSlug }, uploads);
  return json(result, result.ok ? 200 : result.error === "Space not found." ? 404 : 400);
}
