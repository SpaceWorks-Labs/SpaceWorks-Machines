/*
 * Shared pieces of private file-download routes (cards, exports): headers that keep files out of
 * caches and referrers, a uniform 404, and attachment responses.
 */

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Unauthorised, other-space and unknown requests all look the same. */
export function notFoundResponse() {
  return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
}

export function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status, headers: PRIVATE_HEADERS });
}

/** A file name part from free text: lower-case ASCII words joined by hyphens. */
export function slugForFile(value: string, fallback: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || fallback;
}

export function download(body: Uint8Array | Buffer, contentType: string, filename: string) {
  return new Response(body as unknown as BodyInit, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "-")}"`,
    },
  });
}
