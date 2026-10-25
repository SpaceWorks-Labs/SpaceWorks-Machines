/** Pure parts of the colour-mode switch (components/providers.tsx). Client-safe, unit-tested. */

export type RevealStrategy = "instant" | "fade" | "reveal-soft" | "reveal";
export const REVEAL_FEATHER = 160;
export const REVEAL_TIMING = { duration: 720, easing: "cubic-bezier(0.45, 0, 0.2, 1)", fill: "forwards" } as const;

/** Reduced motion wins; without View Transitions a colour cross-fade; otherwise a feathered or hard-edged circle. */
export function revealStrategy(env: { reducedMotion: boolean; viewTransitions: boolean; featheredMask: boolean }): RevealStrategy {
  if (env.reducedMotion) return "instant";
  if (!env.viewTransitions) return "fade";
  return env.featheredMask ? "reveal-soft" : "reveal";
}

/** The click point, or near the top-right corner where the header toggle sits. */
export function revealOrigin(origin: { x: number; y: number } | undefined, viewport: { width: number; height: number }) {
  return { x: origin?.x ?? viewport.width - 40, y: origin?.y ?? 32 };
}

/** Large enough to cover the farthest corner from the origin, plus the feathered edge. */
export function revealRadius(origin: { x: number; y: number }, viewport: { width: number; height: number }, feather = REVEAL_FEATHER) {
  return Math.hypot(Math.max(origin.x, viewport.width - origin.x), Math.max(origin.y, viewport.height - origin.y)) + feather;
}

/** The centre of the element that was clicked, so the reveal grows from it. */
export function centreOf(rect: { left: number; top: number; width: number; height: number }) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
