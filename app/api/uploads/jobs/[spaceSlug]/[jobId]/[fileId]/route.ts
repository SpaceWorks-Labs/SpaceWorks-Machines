import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { downloadAuthorisedJobFile, jobFilesForRequester, JobNotFoundError } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ spaceSlug: string; jobId: string; fileId: string }> }) {
  const { spaceSlug, jobId, fileId } = await params;
  const session = await auth();
  const space = await prisma.space.findUnique({ where: { slug: spaceSlug }, select: { id: true } });
  const missing = () => new Response("Not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!space || !session?.user?.id) return missing();
  try {
    const file = (await jobFilesForRequester(space.id, jobId, session.user.id)).find((file) => file.id === fileId);
    if (!file) return missing();
    const object = await downloadAuthorisedJobFile(space.id, jobId, fileId, session.user.id);
    if (!object) return missing();
    return new Response(new Uint8Array(object.body), { headers: {
      "Content-Type": object.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { if (error instanceof JobNotFoundError) return missing(); throw error; }
}
