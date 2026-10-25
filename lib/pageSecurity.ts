import { NextResponse, type NextRequest } from "next/server";

export function pageSecurity(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...bytes));
  const testBackend = process.env.CI === "true" && process.env.ALLOW_INSECURE_PRODUCTION_TESTS === "1" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.NEXT_PUBLIC_BACKEND_ORIGIN ?? "") ? ` ${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}` : "";
  const csp = [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'",
    "frame-ancestors 'none'",
    // Razorpay Checkout opens in its own frame on the member pay page. A CSP belongs to the document that was
    // loaded, so every /account page allows it (the wallet links to the pay page in-app); nowhere else does.
    request.nextUrl.pathname.startsWith("/account") ? "frame-src https://api.razorpay.com https://checkout.razorpay.com" : "frame-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:", "font-src 'self' data: https:", `connect-src 'self' https:${testBackend}`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Upgrading only makes sense on an HTTPS install; the installer's plain-HTTP mode would break every asset.
    ...(process.env.NODE_ENV === "production" && process.env.ALLOW_PLAIN_HTTP !== "1" && !(process.env.NEXT_PUBLIC_BASE_URL ?? "").startsWith("http:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const incoming = new Headers(request.headers);
  incoming.set("Content-Security-Policy", csp);
  incoming.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: incoming } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-transform");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
