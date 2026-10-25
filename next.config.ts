import type { NextConfig } from "next";

const allowedActionOrigins = process.env.ALLOWED_ACTION_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedDevOrigins = Array.from(new Set([
  "127.0.0.1",
  // Development only: Cloudflare quick tunnels for testing on a phone.
  "*.trycloudflare.com",
  ...(process.env.NEXT_DEV_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []),
]));
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  /** Prisma must not be bundled by Turbopack or model delegates can be missing at runtime. */
  serverExternalPackages: ["@prisma/client", "sharp"],
  output: "standalone",
  poweredByHeader: false,
  // AGENTS.md is a copy of CLAUDE.md (CI diffs them), so next dev must not append its own block.
  agentRules: false,
  allowedDevOrigins,
  experimental: {
    ...(process.env.SWM_DISABLE_BUILD_CACHE === "1" ? { turbopackFileSystemCacheForBuild: false } : {}),
    // The proxy buffers request bodies; machine documents (20 MB) go to a route handler through it.
    proxyClientMaxBodySize: "25mb",
    serverActions: {
      // The default is same-origin only. Configure this explicitly when a
      // trusted CDN/reverse proxy terminates requests on another hostname.
      ...(allowedActionOrigins?.length ? { allowedOrigins: allowedActionOrigins } : {}),
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
          ...(isProduction
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
