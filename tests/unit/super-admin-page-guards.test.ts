import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

describe("super-admin pages", () => {
  // The layout's check does not re-run on client navigation (partial
  // rendering), so each page must verify super-admin access itself.
  it.each(pages("app/super-admin"))("%s checks super-admin access itself", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(/await requireSuperAdmin\(\)/);
  });
});
