import type { PrinterAdapterKind } from "@prisma/client";
import type { ConnectionConfig, PrinterAdapter } from "./types";

/**
 * Network adapters, not available yet ("Coming soon"). Each builds the exact request it will send, so the
 * protocol mapping is unit-tested now; the secret is named but never included in a descriptor.
 */
export type Command = "version" | "status" | "job" | "upload" | "start" | "pause" | "resume" | "cancel";
export type RequestDescriptor = { method: "GET" | "POST"; url: string; auth: string; body?: Record<string, unknown> } | { mqtt: { topic: string; payload: Record<string, unknown> }; auth: string };

const join = (base: string, path: string) => `${base.replace(/\/+$/, "")}${path}`;

export const DESCRIBE: Record<"OCTOPRINT" | "MOONRAKER" | "BAMBU" | "PRUSALINK", (command: Command, config: Pick<ConnectionConfig, "baseUrl" | "deviceId">, file?: string) => RequestDescriptor> = {
  OCTOPRINT: (command, { baseUrl }, file) => {
    const auth = "X-Api-Key header";
    if (command === "version") return { method: "GET", url: join(baseUrl, "/api/version"), auth };
    if (command === "status") return { method: "GET", url: join(baseUrl, "/api/printer"), auth };
    if (command === "job") return { method: "GET", url: join(baseUrl, "/api/job"), auth };
    if (command === "upload") return { method: "POST", url: join(baseUrl, "/api/files/local"), auth, body: { file: file ?? "", select: true, print: false } };
    if (command === "start") return { method: "POST", url: join(baseUrl, "/api/job"), auth, body: { command: "start" } };
    if (command === "cancel") return { method: "POST", url: join(baseUrl, "/api/job"), auth, body: { command: "cancel" } };
    return { method: "POST", url: join(baseUrl, "/api/job"), auth, body: { command: "pause", action: command === "pause" ? "pause" : "resume" } };
  },
  MOONRAKER: (command, { baseUrl }, file) => {
    const auth = "X-Api-Key header";
    if (command === "version") return { method: "GET", url: join(baseUrl, "/server/info"), auth };
    if (command === "status" || command === "job") return { method: "GET", url: join(baseUrl, "/printer/objects/query?print_stats&extruder&heater_bed&display_status"), auth };
    if (command === "upload") return { method: "POST", url: join(baseUrl, "/server/files/upload"), auth, body: { root: "gcodes", file: file ?? "" } };
    if (command === "start") return { method: "POST", url: join(baseUrl, `/printer/print/start?filename=${encodeURIComponent(file ?? "")}`), auth };
    return { method: "POST", url: join(baseUrl, `/printer/print/${command}`), auth };
  },
  BAMBU: (command, { deviceId }, file) => {
    const auth = "LAN access code (MQTT over TLS on 8883; FTPS for uploads)";
    const topic = `device/${deviceId}/request`;
    if (command === "upload") return { mqtt: { topic: "ftps://upload", payload: { file: file ?? "" } }, auth };
    if (command === "version" || command === "status" || command === "job") return { mqtt: { topic, payload: { pushing: { sequence_id: "0", command: "pushall" } } }, auth };
    if (command === "start") return { mqtt: { topic, payload: { print: { sequence_id: "0", command: "project_file", url: `ftp://${file ?? ""}`, param: "Metadata/plate_1.gcode" } } }, auth };
    return { mqtt: { topic, payload: { print: { sequence_id: "0", command: command === "cancel" ? "stop" : command } } }, auth };
  },
  PRUSALINK: (command, { baseUrl }, file) => {
    const auth = "HTTP digest (user name and password)";
    if (command === "version") return { method: "GET", url: join(baseUrl, "/api/version"), auth };
    if (command === "status") return { method: "GET", url: join(baseUrl, "/api/v1/status"), auth };
    if (command === "job") return { method: "GET", url: join(baseUrl, "/api/v1/job"), auth };
    if (command === "upload") return { method: "POST", url: join(baseUrl, `/api/v1/files/usb/${encodeURIComponent(file ?? "")}`), auth };
    if (command === "start") return { method: "POST", url: join(baseUrl, `/api/v1/files/usb/${encodeURIComponent(file ?? "")}`), auth };
    return { method: "POST", url: join(baseUrl, `/api/v1/job/{id}/${command}`), auth };
  },
};

const comingSoon = async () => ({ ok: false, message: "This connection type is coming soon." });

function stub(kind: keyof typeof DESCRIBE, label: string, description: string): PrinterAdapter {
  return { kind: kind as PrinterAdapterKind, label, description, available: false, capabilities: { telemetry: true, control: true, upload: true },
    testConnection: comingSoon, uploadFile: comingSoon, startJob: comingSoon, pauseJob: comingSoon, resumeJob: comingSoon, cancelJob: comingSoon,
    async getStatus() { throw new Error("This connection type is coming soon."); } };
}

export const STUB_ADAPTERS = [
  stub("OCTOPRINT", "OctoPrint", "REST API with an API key."),
  stub("MOONRAKER", "Moonraker / Klipper", "Moonraker's HTTP API."),
  stub("BAMBU", "Bambu Lab", "LAN mode over MQTT with the printer's access code."),
  stub("PRUSALINK", "PrusaLink", "PrusaLink's local API with digest sign-in."),
];
