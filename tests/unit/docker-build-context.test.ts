import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Docker build context secret exclusions", () => {
  const rules = readFileSync(new URL("../../.dockerignore", import.meta.url), "utf8")
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));

  it("excludes private service certificates and installer answers from every source build", () => {
    expect(rules).toContain("tls/");
    expect(rules).toContain(".spaceworks-*");
    expect(rules.filter((rule) => rule.startsWith("!") && /tls|spaceworks/.test(rule))).toEqual([]);
  });

  it("excludes runtime environment files while allowing only the public example", () => {
    expect(rules).toContain(".env");
    expect(rules).toContain(".env.*");
    expect(rules.filter((rule) => rule.startsWith("!") && rule.includes(".env"))).toEqual(["!.env.example"]);
  });

  it("retains dependency security overrides in isolated migration and operator installs", () => {
    const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
    for (const stage of ["prisma-cli", "ops-modules"]) {
      const section = dockerfile.split(`AS ${stage}`)[1]!.split("\nFROM ")[0]!;
      expect(section).toContain("COPY package.json /tmp/app-package.json");
      expect(section).toContain("overrides:require('/tmp/app-package.json').overrides");
    }
  });
});
