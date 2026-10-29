import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { authenticateApiKey, createApiKey, revokeApiKey } from "@/lib/apiKeys";
import { createEndpoint, redeliver, updateEndpoint } from "@/lib/webhooks/endpoints";
import { deliverWebhook } from "@/lib/webhooks/deliver";
import { emitWebhook, enqueueWebhookDeliveries } from "@/lib/webhooks/emit";
import { saveConnection, runPrinterCommand } from "@/lib/printers/connections";
import { pollPrinters } from "@/lib/printers/poll";
import { printerDependencies } from "@/lib/printers/jobs";
import { auditRows } from "@/lib/auditLog";
import { GET as listMachines } from "@/app/api/v1/machines/route";
import { GET as getMachine } from "@/app/api/v1/machines/[id]/route";
import { POST as setStatus } from "@/app/api/v1/machines/[id]/status/route";
import { GET as listMaintenance, POST as createMaintenance } from "@/app/api/v1/maintenance/logs/route";
import { createSchedule, logMaintenance, reportFault } from "@/lib/upkeep";
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

describe("advertised maintenance records API", () => {
  const url = "/api/v1/maintenance/logs";
  const issue = (scopes = ["maintenance:read", "maintenance:write"]) => transaction((tx) => createApiKey(tx, actor(), { name: "Maintenance", scopes }));
  const payload = () => ({ machineId: f.home.machine.id, summary: "Checked belts", cost: 2500, details: "PRIVATE-DETAILS", vendor: "PRIVATE-VENDOR" });

  it("requires a valid key and the method's own scope", async () => {
    expect((await call(listMaintenance, url, "invalid")).status).toBe(401);
    const read = await issue(["maintenance:read"]);
    const write = await issue(["maintenance:write"]);
    const unrelated = await issue(["machines:read"]);
    expect((await call(listMaintenance, url, unrelated.token)).status).toBe(403);
    expect((await call(listMaintenance, url, write.token)).status).toBe(403);
    expect((await call(createMaintenance, url, read.token, {}, payload())).status).toBe(403);
    expect(await prisma.maintenanceLog.count({ where: { spaceId: f.home.space.id } })).toBe(0);
  });

  it("commits an audited maintenance record, ledger cost and webhook while returning only the public DTO", async () => {
    const { token } = await issue();
    await transaction((tx) => createEndpoint(tx, actor(), { url: "http://hooks.example.test/in", events: ["maintenance.logged"] }));
    const response = await call(createMaintenance, url, token, {}, payload());
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(Object.keys(data).sort()).toEqual(["id", "machineId", "scheduleId", "faultId", "kind", "summary", "cost", "performedAt"].sort());
    expect(data).toMatchObject({ machineId: f.home.machine.id, kind: "PREVENTIVE", summary: "Checked belts", cost: 2500 });
    expect(Number.isNaN(Date.parse(data.performedAt))).toBe(false);
    expect(await prisma.maintenanceLog.findUniqueOrThrow({ where: { id: data.id } })).toMatchObject({ spaceId: f.home.space.id, performedById: f.home.user.id, details: "PRIVATE-DETAILS" });
    expect(await prisma.auditEvent.count({ where: { spaceId: f.home.space.id, action: "maintenance.logged", targetId: data.id } })).toBe(1);
    expect(await prisma.financeEntry.findMany({ where: { spaceId: f.home.space.id, sourceId: data.id } })).toEqual([expect.objectContaining({ amountMinor: 2500, category: "MAINTENANCE" })]);
    const deliveries = await prisma.webhookDelivery.findMany({ where: { spaceId: f.home.space.id, event: "maintenance.logged" } });
    expect(deliveries).toHaveLength(1);
    expect(enqueueWebhookDeliveries).toHaveBeenCalledWith([deliveries[0]!.id]);
  });

  it("paginates and filters only the key's tenant, with the same DTO for reads and writes", async () => {
    const { token } = await issue();
    const own = [];
    for (const summary of ["First", "Second"]) own.push((await (await call(createMaintenance, url, token, {}, { ...payload(), summary })).json()).data.id);
    await transaction((tx) => logMaintenance(tx, { spaceId: f.away.space.id, actorId: f.away.user.id }, { machineId: f.away.machine.id, kind: "INSPECTION", summary: "AWAY-PRIVATE" }));
    const first = await (await call(listMaintenance, `${url}?limit=1`, token)).json();
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toBe(first.data[0].id);
    const next = await (await call(listMaintenance, `${url}?limit=1&cursor=${first.nextCursor}`, token)).json();
    expect(next.nextCursor).toBeNull();
    expect([first.data[0].id, next.data[0].id].sort()).toEqual(own.sort());
    expect(JSON.stringify([first, next])).not.toMatch(/AWAY-PRIVATE|PRIVATE-DETAILS|PRIVATE-VENDOR|performedById|spaceId/);
    expect((await (await call(listMaintenance, `${url}?machineId=${f.away.machine.id}`, token)).json()).data).toEqual([]);
  });

  it("rejects foreign machines, schedules and faults without committing records or costs", async () => {
    const { token } = await issue();
    const away = { spaceId: f.away.space.id, actorId: f.away.user.id };
    const schedule = await transaction((tx) => createSchedule(tx, { ...away, machineId: f.away.machine.id }, { title: "Away", trigger: "TIME", intervalDays: 10 }));
    const { fault } = await transaction((tx) => reportFault(tx, away, { machineId: f.away.machine.id, title: "Away fault", severity: "LOW" }));
    for (const extra of [{ machineId: f.away.machine.id }, { scheduleId: schedule.id }, { faultId: fault.id }]) {
      expect((await call(createMaintenance, url, token, {}, { ...payload(), ...extra })).status).toBe(404);
    }
    expect(await prisma.maintenanceLog.count({ where: { spaceId: f.home.space.id } })).toBe(0);
    expect(await prisma.financeEntry.count({ where: { spaceId: f.home.space.id } })).toBe(0);
  });

  it.each(["mfa", "capability", "type-scope", "membership", "suspension"])("refuses writes after creator %s changes", async (change) => {
    const { token } = await issue();
    if (change === "mfa") await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: null } });
    else if (change === "suspension") await prisma.space.update({ where: { id: f.home.space.id }, data: { status: "SUSPENDED" } });
    else await prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: change === "membership" ? { status: "BLOCKED", role: "MEMBER" } : { role: change === "type-scope" ? "TYPE_MANAGER" : "VIEWER" } });
    expect((await call(createMaintenance, url, token, {}, payload())).status).toBe(403);
    expect(await prisma.maintenanceLog.count({ where: { spaceId: f.home.space.id } })).toBe(0);
  });

  it("validates JSON before any domain write", async () => {
    const { token } = await issue();
    for (const extra of [{ summary: " " }, { cost: -1 }, { cost: 1.5 }, { kind: "UNKNOWN" }]) {
      expect((await call(createMaintenance, url, token, {}, { ...payload(), ...extra })).status).toBe(400);
    }
    expect(await prisma.maintenanceLog.count({ where: { spaceId: f.home.space.id } })).toBe(0);
  });

  it("keeps maintenance permission after demotion separate from the manager's authority to post costs", async () => {
    const { token } = await issue();
    await prisma.spaceMember.updateMany({ where: { spaceId: f.home.space.id, userId: f.home.user.id }, data: { role: "TECHNICIAN" } });
    expect((await call(createMaintenance, url, token, {}, payload())).status).toBe(403);
    expect(await prisma.financeEntry.count({ where: { spaceId: f.home.space.id } })).toBe(0);
    expect(await prisma.maintenanceLog.count({ where: { spaceId: f.home.space.id } })).toBe(0);
    const zero = await call(createMaintenance, url, token, {}, { ...payload(), cost: 0 });
    expect(zero.status).toBe(201);
    expect((await zero.json()).data.cost).toBe(0);
    const response = await call(createMaintenance, url, token, {}, { machineId: f.home.machine.id, summary: "Cost-free inspection" });
    expect(response.status).toBe(201);
    expect((await response.json()).data.cost).toBeNull();
    expect(await prisma.financeEntry.count({ where: { spaceId: f.home.space.id } })).toBe(0);
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
