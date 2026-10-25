import { describe, expect, it } from "vitest";
import { COLOR_MODE_COOKIE, isColorMode, resolveColorMode } from "@/lib/colorMode";

describe("colour mode", () => {
  it("defaults to light when nothing is saved or the value is unknown", () => {
    expect(resolveColorMode(undefined)).toBe("light");
    expect(resolveColorMode("system")).toBe("light");
    expect(resolveColorMode("")).toBe("light");
  });

  it("honours an explicit light or dark choice", () => {
    expect(resolveColorMode("dark")).toBe("dark");
    expect(resolveColorMode("light")).toBe("light");
    expect(isColorMode("dark")).toBe(true);
    expect(isColorMode("system")).toBe(false);
  });

  it("uses the space product cookie name", () => {
    expect(COLOR_MODE_COOKIE).toBe("swm.theme");
  });
});
