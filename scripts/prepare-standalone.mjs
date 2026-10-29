import { cp, mkdir } from "node:fs/promises";

await mkdir(".next/standalone/.next", { recursive: true });
await cp("public", ".next/standalone/public", { recursive: true, force: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true, force: true });
// Native tracing can retain Sharp's .node file while omitting its companion libvips DLLs.
// Copy installed @img runtime packages in full, for the platform that produced this build.
await cp("node_modules/@img", ".next/standalone/node_modules/@img", { recursive: true, force: true });

console.log("Prepared the standalone server with public and static assets.");
