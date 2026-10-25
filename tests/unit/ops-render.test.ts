import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const blueprint = readFileSync("render.yaml", "utf8");
const envSource = readFileSync("lib/env.ts", "utf8");

describe("render.yaml", () => {
  it("sets every variable a production server refuses to start without", () => {
    const list = /const missing = \[([^\]]+)\]/.exec(envSource)?.[1] ?? "";
    const required = [...list.matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]!);
    expect(required).toEqual(expect.arrayContaining(["AUTH_URL", "REDIS_URL", "MFA_ENCRYPTION_KEY", "PAYMENT_SECRETS_KEY", "S3_BUCKET"]));
    const keys = new Set([...blueprint.matchAll(/key: ([A-Z0-9_]+)/g)].map((match) => match[1]!));
    for (const key of required) expect(keys.has(key), key).toBe(true);
  });
  it("runs the web service, worker and beat from the one Dockerfile", () => {
    expect(blueprint).toMatch(/type: web[\s\S]*?dockerfilePath: \.\/Dockerfile/);
    expect(blueprint).toContain("dockerCommand: --role worker node dist/worker.js");
    expect(blueprint).toContain("dockerCommand: --role beat node dist/beat.js");
    expect(blueprint).toContain("MIGRATE_ON_START");
  });
  it("matches the README's Deploy to Render button", () => {
    expect(readFileSync("README.md", "utf8")).toContain("https://render.com/deploy?repo=https://github.com/SpaceWorks-Labs/SpaceWorks-Machines");
  });
});
