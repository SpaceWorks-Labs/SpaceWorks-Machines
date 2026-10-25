import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/api/openapi";
import { getRequestOrigin } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

/** The API description itself is public; every operation still needs a key. */
export async function GET() {
  return NextResponse.json(openApiDocument(await getRequestOrigin()), { headers: { "Cache-Control": "public, max-age=300" } });
}
