import { NextResponse } from "next/server";

const startedAtMs = Date.now();
export const dynamic = "force-dynamic";

/** Process liveness only. It never touches the database or Redis. */
export async function GET() {
  return NextResponse.json(
    { ok: true, uptimeMs: Date.now() - startedAtMs, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}
