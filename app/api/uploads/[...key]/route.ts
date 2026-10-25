import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { resolveMachineFile } from "@/lib/machines/fileAccess";
import { downloadFile, isPublicDerivativeKey } from "@/lib/storage";
import { downloadMachineFile, isMachineFileKey } from "@/lib/storage/machineFiles";

type Context = { params: Promise<{ key: string[] }> };

const missingHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const notFound = () => new NextResponse("Not Found", { status: 404, headers: missingHeaders });

/** Check every request: visibility can be revoked, even for a previously public machine file. */
async function machineFile(key: string) {
  const session = await auth();
  const access = await resolveMachineFile(key, session?.user?.id ?? null);
  if (!access) return notFound();
  const asset = await downloadMachineFile(key);
  if (!asset) return notFound();
  const inline = access.kind === "photos" || asset.contentType === "image/webp";
  const filename = (access.filename ?? "file").replace(/[^A-Za-z0-9._ -]/g, "_");
  return new Response(Uint8Array.from(asset.body).buffer, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Disposition": inline ? "inline" : `attachment; filename="${filename}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'",
      "Cross-Origin-Resource-Policy": "same-site",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { key } = await params;
    const dbKey = key.join("/");
    if (isMachineFileKey(dbKey)) return await machineFile(dbKey);
    if (!isPublicDerivativeKey(dbKey)) return notFound();

    const asset = await downloadFile(dbKey);
    if (!asset) return notFound();

    return new Response(Uint8Array.from(asset.body).buffer, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-site",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    console.error("[uploads API] Failed to fetch a stored file.");
    return new NextResponse("Internal Server Error", { status: 500, headers: missingHeaders });
  }
}
