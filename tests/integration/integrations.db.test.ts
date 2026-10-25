import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { authenticateApiKey, createApiKey, revokeApiKey } from "@/lib/apiKeys";
import { createEndpoint, redeliver, updateEndpoint } from "@/lib/webhooks/endpoints";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import { emitWebhook } from "@/lib/webhooks/emit";
import { saveConnection, runPrinterCommand } from "@/lib/printers/connections";
import { pollPrinters } from "@/lib/printers/poll";
import { printerDependencies } from "@/lib/printers/jobs";
import { auditRows } from "@/lib/auditLog";
import { GET as listMachines } from "@/app/api/v1/machines/route";
import { GET as getMachine } from "@/app/api/v1/machines/[id]/route";
import { POST as setStatus } from "@/app/api/v1/machines/[id]/status/route";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";
import { transaction } from "../helpers/machines-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
vi.mock("@/lib/rateLimit", async (original) => ({ ...await original<object>(), checkRateLimitById: async () => true }));
let f: JobsFixture;
beforeEach(async () => { f = await jobsFixture(); });
afterEach(async () => { await f?.cleanup(); });

const actor = () => ({ spaceId: f.home.space.id, actorId: f.home.user.id });
const call = (handler: (request: Request, context: { params: Promise<never> }) => Promise<Response>, url: string, token: string, params: object = {}, body?: unknown) =>
  handler(new Request(`http://local.test${url}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve(params as never) });

describe("API keys and the REST API", () => {
  it("authenticates by key, checks scope, scopes data to the key's space and stops working once revoked or expired", async () => {
    const { key, token } = await transaction((tx) => createApiKey(tx, actor(), { name: "Display", scopes: ["machines:read"] }));
    expect(token).toMatch(/^swm_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(key.secretHash).not.toContain(token);
    expect(await authenticateApiKey(`Bearer ${token}`, "jobs:read", false)).toMatchObject({ status: 403 });
    expect(await authenticateApiKey(`Bearer ${token.slice(0, -1)}x`, "machines:read", false)).toMatchObject({ status: 401 });
    const list = await (await call(listMachines, "/api/v1/machines", token)).json();
    expect(list.data.map((row: { id: string }) => row.id)).toEqual([f.home.machine.id]);
    expect(JSON.stringify(list)).not.toMatch(/serial|notes|@example/i);
    expect((await call(getMachine, `/api/v1/machines/${f.away.machine.id}`, token, { id: f.away.machine.id })).status).toBe(404);
    await transaction((tx) => revokeApiKey(tx, actor(), key.id));
    expect((await call(listMachines, "/api/v1/machines", token)).status).toBe(401);
    const expired = await transaction((tx) => createApiKey(tx, actor(), { name: "Old", scopes: ["machines:read"] }));
    await prisma.apiKey.update({ where: { id: expired.key.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(listMachines, "/api/v1/machines", expired.token)).status).toBe(401);
  });
  it("writes as the key's creator only while they still hold the permission", async () => {
    const { token } = await transaction((tx) => createApiKey(tx, actor(), { name: "Writer", scopes: ["machines:write"] }));
    const ok = await call(setStatus, `/api/v1/machines/${f.home.machine.id}/status`, token, { id: f.home.machine.id }, { status: "MAINTENANCE", note: "API" });
    expect(ok.status).toBe(201);
    expect((await f.machine()).status).toBe("MAINTENANCE");
    expect((await call(setStatus, `/api/v1/machines/x/status`, token, { id: "x" }, { status: "RUNNING" })).status).toBe(400);
    await prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: { role: "VIEWER" } });
    expect((await call(setStatus, `/api/v1/machines/${f.home.machine.id}/status`, token, { id: f.home.machine.id }, { status: "IDLE" })).status).toBe(403);
  });
});

describe("outbound webhooks", () => {
  it("signs deliveries, retries on failure, succeeds, and switches off after 10 failures in a row", async () => {
    const { endpoint, secret } = await transaction((tx) => createEndpoint(tx, actor(), { url: "http://hooks.example.test/in", events: ["machine.status_changed"] }));
    const [id] = await transaction((tx) => emitWebhook(tx, f.home.space.id, "machine.status_changed", { machineId: f.home.machine.id }));
    const sent: Array<{ headers: Record<string, string> }> = [];
    const now = new Date();
    await deliverWebhook(id!, async (_url, init) => { sent.push({ headers: init.headers as Record<string, string> }); return new Response("no", { status: 500 }); }, now);
    let row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, responseStatus: 500 });
    expect(row.nextAttemptAt!.getTime() - now.getTime()).toBe(60_000);
    expect(sent[0]!.headers["x-spaceworks-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(secret).toMatch(/^whsec_/);
    await deliverWebhook(id!, async () => new Response("early"), now);
    expect((await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } })).attempts).toBe(1);
    await deliverWebhook(id!, async () => new Response("ok"), new Date(now.getTime() + 61_000));
    row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id! } });
    expect(row).toMatchObject({ status: "SUCCEEDED", attempts: 2 });
    expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } })).consecutiveFailures).toBe(0);
    for (let index = 0; index < 10; index += 1) {
      const again = await transaction((tx) => redeliver(tx, actor(), id!));
      await deliverWebhook(again.id, async () => { throw new Error("connection refused"); });
    }
    const off = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(off).toMatchObject({ isActive: false, consecutiveFailures: 10 });
    expect(await prisma.outboxMessage.count({ where: { kind: "webhook-disabled", payload: { path: ["spaceId"], equals: f.home.space.id } } })).toBeGreaterThanOrEqual(1);
    await transaction((tx) => updateEndpoint(tx, actor(), { endpointId: endpoint.id, url: endpoint.url, events: endpoint.events, isActive: true }));
    expect(await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } })).toMatchObject({ isActive: true, consecutiveFailures: 0, disabledAt: null });
  });
  it("refuses events that don't exist", async () => {
    await expect(transaction((tx) => createEndpoint(tx, actor(), { url: "http://hooks.example.test/in", events: ["machine.exploded"] }))).rejects.toThrow("at least one event");
  });
});

describe("simulated printer", () => {
  it("starts with the job, finishes it from telemetry, and records usage once through the job", async () => {
    await transaction((tx) => saveConnection(tx, actor(), { machineId: f.home.machine.id, adapter: "SIMULATED", enabled: true, settings: {} }));
    const job = await f.running(printerDependencies);
    const connection = await prisma.printerConnection.findFirstOrThrow({ where: { machineId: f.home.machine.id } });
    expect((connection.simState as { phase: string }).phase).toBe("printing");
    await pollPrinters(new Date(Date.now() + 5 * 3_600_000));
    expect((await f.readJob(job.id)).status).toBe("COMPLETED");
    await pollPrinters(new Date(Date.now() + 6 * 3_600_000));
    expect(await prisma.usageLog.count({ where: { machineId: f.home.machine.id } })).toBe(1);
    expect(await prisma.printerCommandLog.count({ where: { connectionId: connection.id, command: "auto-complete", ok: true } })).toBe(1);
  });
  it("records adapter usage once for a run started at the printer", async () => {
    const connection = await transaction((tx) => saveConnection(tx, actor(), { machineId: f.home.machine.id, adapter: "SIMULATED", enabled: true, settings: { syncMachineStatus: true } }));
    expect((await runPrinterCommand(f.home.space.id, connection.id, "start", f.home.user.id, { name: "Calibration", estimatedSeconds: 600 })).ok).toBe(true);
    await pollPrinters(new Date(Date.now() + 120_000));
    expect((await f.machine()).status).toBe("RUNNING");
    await pollPrinters(new Date(Date.now() + 3_600_000));
    await pollPrinters(new Date(Date.now() + 7_200_000));
    expect(await prisma.usageLog.findMany({ where: { machineId: f.home.machine.id } })).toEqual([expect.objectContaining({ source: "ADAPTER", succeeded: true })]);
    expect((await f.machine()).status).toBe("IDLE");
  });
  it("can't enable a connection type that is coming soon", async () => {
    await expect(transaction((tx) => saveConnection(tx, actor(), { machineId: f.home.machine.id, adapter: "OCTOPRINT", enabled: true, settings: {} }))).rejects.toThrow("coming soon");
  });
});

describe("audit log", () => {
  it("filters by area and person within the space", async () => {
    await transaction((tx) => createApiKey(tx, actor(), { name: "Audit", scopes: ["machines:read"] }));
    const settings = await auditRows(f.home.space.id, { area: "settings" }, 50);
    expect(settings.length).toBeGreaterThanOrEqual(1);
    expect(settings.every((row) => row.action === "SPACE_SETTINGS_CHANGED")).toBe(true);
    expect(await auditRows(f.home.space.id, { actor: f.away.user.id }, 50)).toEqual([]);
  });
});
