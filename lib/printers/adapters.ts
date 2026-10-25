import type { PrinterAdapterKind } from "@prisma/client";
import { simulatedAdapter } from "./simulated";
import { STUB_ADAPTERS } from "./stubs";
import { EMPTY_TELEMETRY, type CommandResult, type PrinterAdapter } from "./types";

const ok = async (): Promise<CommandResult> => ({ ok: true, message: "Recorded. Run the machine by hand." });

/** No telemetry: staff drive the job by hand; commands only go in the log. */
export const manualAdapter: PrinterAdapter = {
  kind: "MANUAL", label: "Manual", description: "No connection. Staff run the machine and update jobs by hand.",
  available: true, capabilities: { telemetry: false, control: false, upload: false },
  async testConnection() { return { ok: true, message: "Manual machines have no connection to test." }; },
  async getStatus() { return { telemetry: { ...EMPTY_TELEMETRY, state: "idle" } }; },
  uploadFile: ok, startJob: ok, pauseJob: ok, resumeJob: ok, cancelJob: ok,
};

export const ADAPTERS: readonly PrinterAdapter[] = [manualAdapter, simulatedAdapter, ...STUB_ADAPTERS];

export function adapterFor(kind: PrinterAdapterKind): PrinterAdapter {
  return ADAPTERS.find((adapter) => adapter.kind === kind) ?? manualAdapter;
}
