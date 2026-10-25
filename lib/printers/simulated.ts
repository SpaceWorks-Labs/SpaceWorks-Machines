import type { CommandResult, PrinterAdapter, Telemetry } from "./types";

/**
 * A deterministic printer: all state lives in `simState` and telemetry is a pure function of it and the clock.
 * Heats for HEAT_SECONDS, then prints for the estimate divided by `speed`; supports pause, resume, cancel and an
 * injected error. Fully working, so the whole adapter flow can be tried without hardware.
 */
export type SimState = {
  phase: "idle" | "printing" | "paused" | "done" | "cancelled" | "error";
  jobName: string | null; startedAt: number | null; pausedAt: number | null; pausedMs: number; estimateSeconds: number; speed: number;
  error: string | null; usageRecorded: boolean;
};
export const HEAT_SECONDS = 60;
const NOZZLE = 215, BED = 60, ROOM = 22;

export function readSimState(value: unknown): SimState {
  const s = (value && typeof value === "object" ? value : {}) as Partial<SimState>;
  return { phase: s.phase ?? "idle", jobName: s.jobName ?? null, startedAt: s.startedAt ?? null, pausedAt: s.pausedAt ?? null, pausedMs: s.pausedMs ?? 0,
    estimateSeconds: s.estimateSeconds ?? 0, speed: s.speed && s.speed > 0 ? s.speed : 1, error: s.error ?? null, usageRecorded: s.usageRecorded ?? false };
}

/** Seconds of active run time (heating included), excluding paused time. */
export function activeSeconds(state: SimState, now: number) {
  if (!state.startedAt) return 0;
  const end = state.phase === "paused" && state.pausedAt ? state.pausedAt : now;
  return Math.max(0, (end - state.startedAt - state.pausedMs) / 1000);
}

/** Advance the phase for the clock: a print whose time is up is done. */
export function settle(state: SimState, now: number): SimState {
  if (state.phase !== "printing") return state;
  const total = HEAT_SECONDS + state.estimateSeconds / state.speed;
  return activeSeconds(state, now) >= total ? { ...state, phase: "done" } : state;
}

export function simTelemetry(raw: SimState, now: number): Telemetry {
  const state = settle(raw, now);
  const active = activeSeconds(state, now);
  const printSeconds = state.estimateSeconds / state.speed;
  const heating = state.phase === "printing" && active < HEAT_SECONDS;
  const warm = state.phase === "printing" || state.phase === "paused";
  const heat = (target: number) => warm ? Math.round(ROOM + (target - ROOM) * Math.min(1, active / HEAT_SECONDS)) : ROOM;
  const progress = state.phase === "done" ? 100 : state.startedAt ? Math.min(99, Math.floor(Math.max(0, active - HEAT_SECONDS) / Math.max(1, printSeconds) * 100)) : null;
  return {
    state: state.phase === "printing" ? "printing" : state.phase === "paused" ? "paused" : state.phase === "error" ? "error" : "idle",
    nozzleC: heat(NOZZLE), nozzleTargetC: warm ? NOZZLE : 0, bedC: heat(BED), bedTargetC: warm ? BED : 0,
    progress: heating ? 0 : progress, jobName: state.jobName,
    elapsedSeconds: state.startedAt ? Math.round(active) : null,
    remainingSeconds: warm ? Math.max(0, Math.round(HEAT_SECONDS + printSeconds - active)) : null,
    ...(state.error ? { error: state.error } : {}),
  };
}

const done = (message: string, simState: SimState): CommandResult => ({ ok: true, message, simState });
const refuse = (message: string): CommandResult => ({ ok: false, message });

export const simulatedAdapter: PrinterAdapter = {
  kind: "SIMULATED", label: "Simulated printer", description: "A built-in printer simulation for trying the connection, telemetry and job flow.",
  available: true, capabilities: { telemetry: true, control: true, upload: true },
  async testConnection() { return { ok: true, message: "The simulated printer is ready." }; },
  async getStatus(config, now) {
    const state = settle(readSimState(config.simState), now.getTime());
    return { telemetry: simTelemetry(state, now.getTime()), simState: state };
  },
  async uploadFile(config, file) { return done(`Received ${file.name}.`, readSimState(config.simState)); },
  async startJob(config, request, now) {
    const state = settle(readSimState(config.simState), now.getTime());
    if (state.phase === "printing" || state.phase === "paused") return refuse("The printer is already printing.");
    return done(`Started ${request.name}.`, { ...state, phase: "printing", jobName: request.name, startedAt: now.getTime(), pausedAt: null, pausedMs: 0,
      estimateSeconds: Math.max(60, request.estimatedSeconds), error: null, usageRecorded: false });
  },
  async pauseJob(config, now) {
    const state = settle(readSimState(config.simState), now.getTime());
    return state.phase === "printing" ? done("Paused.", { ...state, phase: "paused", pausedAt: now.getTime() }) : refuse("Nothing is printing.");
  },
  async resumeJob(config, now) {
    const state = readSimState(config.simState);
    return state.phase === "paused" && state.pausedAt ? done("Resumed.", { ...state, phase: "printing", pausedMs: state.pausedMs + now.getTime() - state.pausedAt, pausedAt: null }) : refuse("Nothing is paused.");
  },
  async cancelJob(config, now) {
    const state = settle(readSimState(config.simState), now.getTime());
    return state.phase === "printing" || state.phase === "paused" ? done("Cancelled.", { ...state, phase: "cancelled", pausedAt: state.pausedAt ?? now.getTime() }) : refuse("Nothing is printing.");
  },
};

/** Simulator-only control: make the current print fail, to try the failure path. */
export function injectError(raw: unknown, now: number, message = "Simulated nozzle clog"): CommandResult {
  const state = settle(readSimState(raw), now);
  return state.phase === "printing" || state.phase === "paused" ? done("Error injected.", { ...state, phase: "error", error: message, pausedAt: state.pausedAt ?? now }) : refuse("Nothing is printing.");
}
