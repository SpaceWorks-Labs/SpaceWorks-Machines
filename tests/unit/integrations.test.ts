import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nextAttemptDelay, signWebhook } from "@/lib/webhooks/sign";
import { HEAT_SECONDS, injectError, readSimState, simTelemetry, simulatedAdapter } from "@/lib/printers/simulated";
import { DESCRIBE } from "@/lib/printers/stubs";
import { openApiDocument } from "@/lib/api/openapi";
import { API_SCOPES, API_SCOPE_LABELS } from "@/lib/apiScopes";

describe("webhook signing and retries", () => {
  it("signs t.body with HMAC-SHA256 in the documented header format", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const header = signWebhook("whsec_test", '{"a":1}', now);
    const t = Math.floor(now.getTime() / 1000);
    expect(header).toBe(`t=${t},v1=${createHmac("sha256", "whsec_test").update(`${t}.{"a":1}`).digest("hex")}`);
  });
  it("retries after 1 min, 5 min, 30 min, 2 h and 12 h, then stops", () => {
    expect([1, 2, 3, 4, 5, 6].map(nextAttemptDelay)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, null]);
  });
});

describe("simulated printer", () => {
  const t0 = new Date("2026-10-24T10:00:00Z");
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
  it("heats, prints over the estimate, and finishes", async () => {
    const started = await simulatedAdapter.startJob({ baseUrl: "", deviceId: "", secret: null, simState: null }, { name: "Bracket", estimatedSeconds: 600 }, t0);
    expect(started.ok).toBe(true);
    const heating = simTelemetry(readSimState(started.simState), at(30).getTime());
    expect(heating).toMatchObject({ state: "printing", progress: 0, nozzleTargetC: 215, jobName: "Bracket" });
    expect(heating.nozzleC!).toBeGreaterThan(22);
    expect(simTelemetry(readSimState(started.simState), at(HEAT_SECONDS + 300).getTime())).toMatchObject({ state: "printing", progress: 50 });
    const done = await simulatedAdapter.getStatus({ baseUrl: "", deviceId: "", secret: null, simState: started.simState }, at(HEAT_SECONDS + 601));
    expect(done.telemetry).toMatchObject({ state: "idle", progress: 100 });
    expect(readSimState(done.simState).phase).toBe("done");
  });
  it("excludes paused time and supports cancel and an injected error", async () => {
    const config = (simState: unknown) => ({ baseUrl: "", deviceId: "", secret: null, simState });
    const started = await simulatedAdapter.startJob(config(null), { name: "Part", estimatedSeconds: 600 }, t0);
    const paused = await simulatedAdapter.pauseJob(config(started.simState), at(HEAT_SECONDS + 60));
    const resumed = await simulatedAdapter.resumeJob(config(paused.simState), at(HEAT_SECONDS + 1060));
    expect(simTelemetry(readSimState(resumed.simState), at(HEAT_SECONDS + 1060).getTime()).progress).toBe(10);
    expect((await simulatedAdapter.startJob(config(resumed.simState), { name: "x", estimatedSeconds: 60 }, at(HEAT_SECONDS + 1061))).ok).toBe(false);
    const failed = injectError(resumed.simState, at(HEAT_SECONDS + 1100).getTime());
    expect(simTelemetry(readSimState(failed.simState), at(HEAT_SECONDS + 1200).getTime())).toMatchObject({ state: "error", error: "Simulated nozzle clog" });
    expect((await simulatedAdapter.cancelJob(config(started.simState), at(10))).ok).toBe(true);
    expect((await simulatedAdapter.pauseJob(config(null), t0)).ok).toBe(false);
  });
});

describe("network adapter stubs", () => {
  const config = { baseUrl: "https://printer.example/", deviceId: "01S00A123" };
  it("build the documented requests without secrets", () => {
    expect(DESCRIBE.OCTOPRINT("start", config)).toEqual({ method: "POST", url: "https://printer.example/api/job", auth: "X-Api-Key header", body: { command: "start" } });
    expect(DESCRIBE.OCTOPRINT("version", config)).toMatchObject({ method: "GET", url: "https://printer.example/api/version" });
    expect(DESCRIBE.MOONRAKER("pause", config)).toMatchObject({ method: "POST", url: "https://printer.example/printer/print/pause" });
    expect(DESCRIBE.MOONRAKER("start", config, "part.gcode")).toMatchObject({ url: "https://printer.example/printer/print/start?filename=part.gcode" });
    expect(DESCRIBE.BAMBU("cancel", config)).toEqual({ mqtt: { topic: "device/01S00A123/request", payload: { print: { sequence_id: "0", command: "stop" } } }, auth: expect.any(String) });
    expect(DESCRIBE.PRUSALINK("status", config)).toMatchObject({ method: "GET", url: "https://printer.example/api/v1/status" });
    for (const describe of Object.values(DESCRIBE)) expect(JSON.stringify(describe("start", config))).not.toContain("secret");
  });
});

describe("OpenAPI document and scopes", () => {
  it("describes every route with its scope and bearer auth", () => {
    const doc = openApiDocument("https://machines.example/");
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0]!.url).toBe("https://machines.example/api/v1");
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(["/machines", "/jobs/{id}/transitions", "/consumables/{id}/adjustments", "/faults", "/payments"]));
    for (const ops of Object.values(doc.paths)) for (const op of Object.values(ops) as Array<{ "x-scope": string }>) expect(API_SCOPES).toContain(op["x-scope"]);
  });
  it("labels every scope", () => {
    for (const scope of API_SCOPES) expect(API_SCOPE_LABELS[scope]).toMatch(/\w/);
  });
});
