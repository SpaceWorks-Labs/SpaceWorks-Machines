import { describe, expect, it } from "vitest";
import { centreOf, REVEAL_FEATHER, REVEAL_TIMING, revealOrigin, revealRadius, revealStrategy } from "@/lib/themeReveal";

describe("colour-mode reveal", () => {
  it("switches instantly under reduced motion, whatever the browser supports", () => {
    expect(revealStrategy({ reducedMotion: true, viewTransitions: true, featheredMask: true })).toBe("instant");
    expect(revealStrategy({ reducedMotion: true, viewTransitions: false, featheredMask: false })).toBe("instant");
  });
  it("cross-fades without View Transitions and prefers the feathered mask when available", () => {
    expect(revealStrategy({ reducedMotion: false, viewTransitions: false, featheredMask: true })).toBe("fade");
    expect(revealStrategy({ reducedMotion: false, viewTransitions: true, featheredMask: true })).toBe("reveal-soft");
    expect(revealStrategy({ reducedMotion: false, viewTransitions: true, featheredMask: false })).toBe("reveal");
  });
  it("grows from the click, or the header corner, far enough to cover the farthest corner plus the feather", () => {
    const viewport = { width: 1200, height: 800 };
    expect(revealOrigin(undefined, viewport)).toEqual({ x: 1160, y: 32 });
    expect(revealOrigin({ x: 10, y: 20 }, viewport)).toEqual({ x: 10, y: 20 });
    expect(revealRadius({ x: 0, y: 0 }, viewport)).toBeCloseTo(Math.hypot(1200, 800) + REVEAL_FEATHER);
    expect(revealRadius({ x: 600, y: 400 }, viewport, 0)).toBeCloseTo(Math.hypot(600, 400));
    expect(centreOf({ left: 100, top: 50, width: 40, height: 20 })).toEqual({ x: 120, y: 60 });
  });
  it("keeps the documented timing and holds the last frame", () => {
    expect(REVEAL_TIMING).toEqual({ duration: 720, easing: "cubic-bezier(0.45, 0, 0.2, 1)", fill: "forwards" });
  });
});
