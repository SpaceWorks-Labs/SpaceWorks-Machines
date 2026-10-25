/** Machines easter eggs (docs/DESIGN.md "Easter eggs"). Pure and client-safe. */

/** The layer ticker draws a finished print as this many stacked layers. */
export const TICKER_LAYERS = 12;

/** Layers to draw for a progress percentage (0–100), rounding down so 100 % is the only full stack. */
export function layersFor(progress: number, total = TICKER_LAYERS) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return clamped >= 100 ? total : Math.floor((clamped / 100) * total);
}

/** "Beep boop": a machine came back into service when it was in maintenance or offline and is now idle. */
export function cameBackInService(previous: string | null, next: string) {
  return (previous === "MAINTENANCE" || previous === "OFFLINE") && next === "IDLE";
}

export const BEEP_MS = 2400;
export const statusKey = (machineId: string) => `swm.machine-status.${machineId}`;
