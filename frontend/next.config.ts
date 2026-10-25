import path from "node:path";
import type { NextConfig } from "next";
import shared from "../next.config";

const root = path.resolve(__dirname, "..");
const config: NextConfig = {
  ...shared,
  // Netlify builds without standalone output; the frontend container image needs it.
  ...(process.env.SWM_FRONTEND_STANDALONE === "1" ? { output: "standalone" as const, outputFileTracingRoot: root } : { output: undefined }),
  serverExternalPackages: ["sharp"],
  turbopack: {
    root,
  },
};
export default config;
