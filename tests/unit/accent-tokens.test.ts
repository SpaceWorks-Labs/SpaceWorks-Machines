import { describe, expect, it } from "vitest";
import { ACCENT_PRESETS, accentStyle, contrastRatio, DEFAULT_SPACE_ACCENT, getAccentTokens, INK_ACCENT, normalizeAccentHex } from "@/lib/theme/accent";

describe("accent normalisation", () => {
  it("accepts 6- and 3-digit hex and rejects anything that could inject CSS", () => {
    expect(normalizeAccentHex("#006e63")).toBe("#006E63");
    expect(normalizeAccentHex(" #abc ")).toBe("#AABBCC");
    expect(normalizeAccentHex("red")).toBe(DEFAULT_SPACE_ACCENT);
    expect(normalizeAccentHex("#006E63; background: url(x)")).toBe(DEFAULT_SPACE_ACCENT);
    expect(normalizeAccentHex(null)).toBe(DEFAULT_SPACE_ACCENT);
    expect(normalizeAccentHex(undefined, INK_ACCENT)).toBe(INK_ACCENT);
  });

  it("defaults to the Space Works brand colours", () => {
    expect(DEFAULT_SPACE_ACCENT).toBe("#006E63");
    expect(INK_ACCENT).toBe("#142C2A");
  });
});

describe("accent tokens", () => {
  it("reproduces the global Maker Teal tokens for the default accent", () => {
    expect(getAccentTokens(DEFAULT_SPACE_ACCENT, "light")).toEqual({
      "--sw-accent": "#006E63",
      "--sw-accent-soft": "#E0EEEC",
      "--sw-on-accent": "#FFF4E8",
      "--sw-accent-text": "#006E63",
    });
    expect(getAccentTokens(DEFAULT_SPACE_ACCENT, "dark")).toEqual({
      "--sw-accent": "#006E63",
      "--sw-accent-soft": "#1A4A45",
      "--sw-on-accent": "#FFF4E8",
      "--sw-accent-text": "#ABC8BC",
    });
  });

  it.each(["#006E63", "#FF7447", "#B5CDFF", "#142C2A", "#C2410C", "#4B3FA8", "#FDE047", "#A7F3D0", "#FFFFFF", "#000000", "#EC4899", "#777777"])(
    "keeps every derived pairing readable for %s",
    (accent) => {
      const surfaces = { light: ["#FFF4E8", "#FFFFFF", "#F6ECE0"], dark: ["#142C2A", "#1F433F", "#193935"] };
      for (const scheme of ["light", "dark"] as const) {
        const tokens = getAccentTokens(accent, scheme);
        expect(contrastRatio(tokens["--sw-on-accent"], tokens["--sw-accent"])).toBeGreaterThanOrEqual(4.5);
        for (const surface of [...surfaces[scheme], tokens["--sw-accent-soft"]]) {
          expect(contrastRatio(tokens["--sw-accent-text"], surface)).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("puts Deep Ink, never cream or white, on light accents", () => {
    expect(getAccentTokens("#FDE047", "light")["--sw-on-accent"]).toBe("#142C2A");
    expect(getAccentTokens("#FF7447", "light")["--sw-on-accent"]).toBe("#142C2A");
    for (const preset of ACCENT_PRESETS) {
      const onAccent = getAccentTokens(preset.hex, "light")["--sw-on-accent"];
      expect(contrastRatio(onAccent, preset.hex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("offers the Space Works brand colours as presets, Maker Teal first", () => {
    expect(ACCENT_PRESETS[0].hex).toBe(DEFAULT_SPACE_ACCENT);
    expect(ACCENT_PRESETS.map((preset) => preset.hex)).toEqual(["#006E63", "#FF7447", "#B5CDFF", "#142C2A"]);
  });

  it("exposes light and dark values for the page root", () => {
    const style = accentStyle("#4B3FA8");
    expect(style["--sw-accent-light"]).toBe("#4B3FA8");
    expect(style["--sw-accent-dark"]).toBe("#4B3FA8");
    expect(Object.keys(style)).toHaveLength(8);
  });
});
