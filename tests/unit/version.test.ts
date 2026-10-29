import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("the release version", () => {
  it("is the same in VERSION, both package files and the newest changelog entry", () => {
    const version = read("VERSION").trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(JSON.parse(read("package.json")).version).toBe(version);
    expect(JSON.parse(read("frontend/package.json")).version).toBe(version);
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.version).toBe(version);
    expect(lock.packages[""].version).toBe(version);
    expect(lock.packages.frontend.version).toBe(version);
    expect(read("CHANGELOG.md").match(/^## (\S+)/m)?.[1]).toBe(version);
    expect(read("docs/DECISIONS.md")).toContain("first public release is 0.5.0");
  });
});
