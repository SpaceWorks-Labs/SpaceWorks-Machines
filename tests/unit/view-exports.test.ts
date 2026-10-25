import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The split frontend replaces each view module with stubs that forward async loaders only, so a
// constant exported from a view compiles on the backend but breaks the frontend build.
describe("view modules", () => {
  const dir = resolve(process.cwd(), "lib/views");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));

  it.each(files)("%s exports only async loaders and types", (name) => {
    const source = readFileSync(resolve(dir, name), "utf8");
    const runtimeExports = source.split("\n").filter((line) => /^export\s+(?!type\b|interface\b|async function\b)/.test(line));
    expect(runtimeExports).toEqual([]);
  });
});
