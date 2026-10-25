/** Pure movement rules for Patch on the 404 page (components/feedback/NotFoundPet.tsx). */

export type PetState = "walk" | "run" | "sit" | "sleep";
export type PetFacing = "left" | "right";

/** Gap kept between Patch and either edge of the window, in px. */
export const PET_EDGE = 12;
/** Ignored this long, Patch wanders off on its own; this long, it naps. */
export const WANDER_AFTER_MS = 4_500;
export const SLEEP_AFTER_MS = 15_000;
/** A paw print every this many px travelled. */
export const PAW_STRIDE = 34;

export function petMaxX(viewportWidth: number, petWidth: number) {
  return Math.max(PET_EDGE, viewportWidth - petWidth - PET_EDGE);
}

/**
 * Where Patch starts. With reduced motion Patch sits still near the right edge, facing into the page, and
 * never moves again; otherwise it starts a little in from the left, ready to trot right.
 */
export function petStart(reduceMotion: boolean, viewportWidth: number, petWidth: number): { x: number; facing: PetFacing; state: PetState } {
  const maxX = petMaxX(viewportWidth, petWidth);
  return reduceMotion
    ? { x: maxX - 8, facing: "left", state: "sit" }
    : { x: Math.min(maxX, viewportWidth * 0.18), facing: "right", state: "sit" };
}

/** Where a pointer at `clientX` asks Patch to go, clamped to the window. */
export function petTarget(clientX: number, viewportWidth: number, petWidth: number) {
  return Math.min(petMaxX(viewportWidth, petWidth), Math.max(PET_EDGE, clientX - petWidth / 2));
}

/**
 * One frame of travel towards the target. `dt` is the elapsed time in 60 fps frames. Far targets make
 * Patch run; close ones walk; within 2 px it sits.
 */
export function petStride(dx: number, dt: number): { state: "walk" | "run" | "sit"; move: number } {
  if (Math.abs(dx) <= 2) return { state: "sit", move: 0 };
  const fast = Math.abs(dx) > 220;
  const speed = Math.min(Math.abs(dx) * 0.06, fast ? 7.5 : 3.2) * dt;
  const step = Math.sign(dx) * Math.max(0.6, speed);
  return { state: fast ? "run" : "walk", move: Math.abs(step) > Math.abs(dx) ? dx : step };
}
