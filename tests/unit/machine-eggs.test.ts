import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEEP_MS, cameBackInService, layersFor, statusKey, TICKER_LAYERS } from "@/lib/patch/eggs";

describe("Machines easter eggs", () => {
  it("draws layers in proportion to progress, full only at 100 %", () => {
    expect(layersFor(0)).toBe(0);
    expect(layersFor(50)).toBe(TICKER_LAYERS / 2);
    expect(layersFor(99)).toBe(TICKER_LAYERS - 1);
    expect(layersFor(100)).toBe(TICKER_LAYERS);
    expect(layersFor(250)).toBe(TICKER_LAYERS);
    expect(layersFor(-5)).toBe(0);
    expect(layersFor(Number.NaN)).toBe(0);
  });
  it("beeps only when a machine returns to idle from maintenance or offline", () => {
    expect(cameBackInService("MAINTENANCE", "IDLE")).toBe(true);
    expect(cameBackInService("OFFLINE", "IDLE")).toBe(true);
    expect(cameBackInService("RUNNING", "IDLE")).toBe(false);
    expect(cameBackInService(null, "IDLE")).toBe(false);
    expect(cameBackInService("MAINTENANCE", "OFFLINE")).toBe(false);
    expect(statusKey("m1")).toBe("swm.machine-status.m1");
    expect(BEEP_MS).toBeLessThanOrEqual(3000);
  });
  it("keeps both eggs decorative and out of the way of controls", () => {
    for (const file of ["components/eggs/LayerTicker.tsx", "components/eggs/BeepBoop.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("aria-hidden");
      expect(source).toContain("pointer-events-none");
    }
    expect(readFileSync("components/eggs/LayerTicker.tsx", "utf8")).toContain("prefers-reduced-motion");
  });
  it("documents every egg in docs/DESIGN.md", () => {
    const design = readFileSync("docs/DESIGN.md", "utf8");
    for (const egg of ["Layer ticker", "Beep boop", "Patch on the 404"]) expect(design).toContain(egg);
  });
});
