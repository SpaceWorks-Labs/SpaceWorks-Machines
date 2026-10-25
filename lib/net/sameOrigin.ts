import { isFrontendPeer } from "@/lib/frontend/peer";

/**
 * Cookie-authenticated route handlers that change data accept only same-origin browser requests (or the
 * split-hosting frontend, which checks the browser's origin itself before forwarding).
 */
export function isSameOriginRequest(request: Request) {
  if (isFrontendPeer(request.headers)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const url = new URL(request.url);
  const allowed = new Set([url.origin]);
  // Next may construct its internal URL with the listening hostname (for example localhost),
  // while the browser uses another host on the same install. Host is the browser's actual target.
  const host = request.headers.get("host");
  if (host) {
    try {
      const target = new URL(`${url.protocol}//${host}`);
      if (target.host === host.toLowerCase()) allowed.add(target.origin);
    } catch { /* An invalid Host header authorises nothing. */ }
  }
  for (const value of [process.env.NEXT_PUBLIC_BASE_URL, process.env.AUTH_URL]) {
    try {
      if (value) allowed.add(new URL(value).origin);
    } catch {
      // An unparsable setting adds nothing.
    }
  }
  return allowed.has(origin);
}
