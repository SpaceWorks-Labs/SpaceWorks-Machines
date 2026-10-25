import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, nudgeHsv } from "@/lib/theme/colorSpace";

describe("colour picker maths", () => {
  it("converts known colours", () => {
    expect(hexToHsv("#FF0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00FF00");
    expect(hsvToHex({ h: 240, s: 1, v: 0.5 })).toBe("#000080");
    expect(hexToHsv("red")).toBeNull();
  });

  it("round-trips every preset and a spread of colours exactly", () => {
    for (const hex of ["#006E63", "#FF7447", "#B5CDFF", "#142C2A", "#FFF4E8", "#C2410C", "#4B3FA8", "#FFFFFF", "#7F7F7F", "#12AB34", "#FEDCBA"]) {
      expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    }
  });

  it("keeps keyboard nudges inside the square", () => {
    expect(nudgeHsv({ h: 10, s: 0.995, v: 0.005 }, 0.1, -0.1)).toEqual({ h: 10, s: 1, v: 0 });
  });
});
