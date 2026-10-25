import type { PrinterAdapterKind } from "@prisma/client";

/** The printer adapter contract (docs/plans/domain-behaviour.md §5). Client-safe types. */

export type PrinterState = "idle" | "printing" | "paused" | "error" | "offline";
export type Telemetry = {
  state: PrinterState; nozzleC: number | null; nozzleTargetC: number | null; bedC: number | null; bedTargetC: number | null;
  progress: number | null; jobName: string | null; elapsedSeconds: number | null; remainingSeconds: number | null; error?: string;
};
export type ConnectionConfig = { baseUrl: string; deviceId: string; secret: string | null; simState: unknown };
export type CommandResult = { ok: boolean; message: string; simState?: unknown };
export type PrintRequest = { name: string; estimatedSeconds: number };

export type PrinterAdapter = {
  kind: PrinterAdapterKind;
  label: string;
  description: string;
  /** False for adapters shown as "Coming soon": they can't be enabled. */
  available: boolean;
  capabilities: { telemetry: boolean; control: boolean; upload: boolean };
  testConnection(config: ConnectionConfig): Promise<{ ok: boolean; message: string }>;
  getStatus(config: ConnectionConfig, now: Date): Promise<{ telemetry: Telemetry; simState?: unknown }>;
  uploadFile(config: ConnectionConfig, file: { name: string; size: number }): Promise<CommandResult>;
  startJob(config: ConnectionConfig, request: PrintRequest, now: Date): Promise<CommandResult>;
  pauseJob(config: ConnectionConfig, now: Date): Promise<CommandResult>;
  resumeJob(config: ConnectionConfig, now: Date): Promise<CommandResult>;
  cancelJob(config: ConnectionConfig, now: Date): Promise<CommandResult>;
};

export const EMPTY_TELEMETRY: Telemetry = { state: "offline", nozzleC: null, nozzleTargetC: null, bedC: null, bedTargetC: null,
  progress: null, jobName: null, elapsedSeconds: null, remainingSeconds: null };
