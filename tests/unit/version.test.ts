import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("the release version", () => {
  it("is the same in VERSION, both package files and the newest changelog entry", () => {
    const version = read("VERSION").trim();
    expect(version).toBe("0.5.0");
    expect(JSON.parse(read("package.json")).version).toBe(version);
    expect(JSON.parse(read("frontend/package.json")).version).toBe(version);
    expect(read("CHANGELOG.md").match(/^## (\S+)/m)?.[1]).toBe(version);
    expect(read("docs/DECISIONS.md")).toContain(`first public release is ${version}`);
  });
});
