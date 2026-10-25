import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resolveMachineFile } from "@/lib/machines/fileAccess";
import { machineFileKey } from "@/lib/storage/machineFiles";
import { addMaintenanceAttachment, createSchedule, endDowntime, logMaintenance, reportFault, runMaintenanceSweep, runWarrantySweep,
  saveWarranty, serviceHistory, startDowntime, updateFault, UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep";
import { loadReports } from "@/lib/reports/load";
import { machinesFixture, transaction, type MachinesFixture } from "../helpers/machines-db";

vi.mock("@/lib/webhooks/emit", async (original) => ({ ...await original<object>(), enqueueWebhookDeliveries: vi.fn() }));
let f: MachinesFixture;
beforeEach(async () => { f = await machinesFixture(); });
afterEach(async () => { await f?.cleanup(); });

const DAY = 86_400_000;
const home = () => ({ spaceId: f.home.space.id, actorId: f.home.user.id });
const machine = () => prisma.machine.findUniqueOrThrow({ where: { id: f.home.machine.id } });
const outbox = (kind: string) => prisma.outboxMessage.count({ where: { kind, payload: { path: ["spaceId"], equals: f.home.space.id } } });

describe("maintenance schedules and records", () => {
  it("completes a time schedule cycle: advance from the old due date, reset the reminder, append an audited record", async () => {
    const due = new Date(Date.now() - 2 * DAY);
    const schedule = await transaction((tx) => createSchedule(tx, { ...home(), machineId: f.home.machine.id },
      { title: "Clean lens", trigger: "TIME", intervalDays: 30, firstDueOn: due.toISOString().slice(0, 10) }));
    await prisma.maintenanceSchedule.update({ where: { id: schedule.id }, data: { lastNotifiedAt: new Date() } });
    const { log } = await transaction((tx) => logMaintenance(tx, home(), { machineId: f.home.machine.id, scheduleId: schedule.id, kind: "PREVENTIVE", summary: "Cleaned", cost: 1500 }));
    const after = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(after.lastNotifiedAt).toBeNull();
    expect(after.nextDueAt!.toISOString().slice(0, 10)).toBe(new Date(new Date(due.toISOString().slice(0, 10)).getTime() + 30 * DAY).toISOString().slice(0, 10));
    expect(await prisma.auditEvent.count({ where: { action: "maintenance.logged", targetId: log.id } })).toBe(1);
    await expect(prisma.maintenanceLog.update({ where: { id: log.id }, data: { summary: "Edited" } })).rejects.toThrow(/append-only/);
  });
  it("validates intervals per trigger and refuses another space's machine or schedule", async () => {
    await expect(transaction((tx) => createSchedule(tx, { ...home(), machineId: f.home.machine.id }, { title: "Belts", trigger: "USAGE_HOURS", intervalDays: 10 })))
      .rejects.toBeInstanceOf(UpkeepError);
    await expect(transaction((tx) => createSchedule(tx, { ...home(), machineId: f.away.machine.id }, { title: "Belts", trigger: "TIME", intervalDays: 10 })))
      .rejects.toBeInstanceOf(UpkeepNotFoundError);
    const away = await transaction((tx) => createSchedule(tx, { spaceId: f.away.space.id, actorId: f.away.user.id, machineId: f.away.machine.id }, { title: "Away", trigger: "JOB_COUNT", intervalJobs: 5 }));
    await expect(transaction((tx) => logMaintenance(tx, home(), { machineId: f.home.machine.id, scheduleId: away.id, kind: "PREVENTIVE", summary: "x" })))
      .rejects.toBeInstanceOf(UpkeepNotFoundError);
  });
  it("caps attachments per record", async () => {
    const { log } = await transaction((tx) => logMaintenance(tx, home(), { machineId: f.home.machine.id, kind: "INSPECTION", summary: "Checked" }));
    for (let index = 0; index < 10; index += 1) {
      await transaction((tx) => addMaintenanceAttachment(tx, home(), { logId: log.id, storageKey: machineFileKey(f.home.space.id, f.home.machine.id, "maintenance", "pdf"), filename: "a.pdf", contentType: "application/pdf", sizeBytes: 10 }));
    }
    await expect(transaction((tx) => addMaintenanceAttachment(tx, home(), { logId: log.id, storageKey: machineFileKey(f.home.space.id, f.home.machine.id, "maintenance", "pdf"), filename: "a.pdf", contentType: "application/pdf", sizeBytes: 10 })))
      .rejects.toThrow("up to 10");
  });
});

describe("downtime and faults", () => {
  it("opens one downtime window at a time and returns the machine to idle when it ends", async () => {
    await transaction((tx) => startDowntime(tx, home(), { machineId: f.home.machine.id, reason: "REPAIR" }));
    expect((await machine()).status).toBe("MAINTENANCE");
    await expect(transaction((tx) => startDowntime(tx, home(), { machineId: f.home.machine.id, reason: "REPAIR" }))).rejects.toThrow("open downtime");
    await transaction((tx) => endDowntime(tx, home(), { machineId: f.home.machine.id }));
    expect((await machine()).status).toBe("IDLE");
    await expect(transaction((tx) => endDowntime(tx, home(), { machineId: f.home.machine.id }))).rejects.toThrow("no open downtime");
  });
  it("refuses downtime on a busy machine", async () => {
    await prisma.machine.update({ where: { id: f.home.machine.id }, data: { status: "RUNNING" } });
    await expect(transaction((tx) => startDowntime(tx, home(), { machineId: f.home.machine.id, reason: "REPAIR" }))).rejects.toThrow("running job");
  });
  it("takes the machine offline for serious faults only, alerts staff and runs the workflow to a resolution", async () => {
    const low = await transaction((tx) => reportFault(tx, home(), { machineId: f.home.machine.id, severity: "LOW", title: "Squeak", takeOffline: true }));
    expect((await machine()).status).toBe("IDLE");
    const high = await transaction((tx) => reportFault(tx, home(), { machineId: f.home.machine.id, severity: "CRITICAL", title: "Smoke", takeOffline: true }));
    expect(high.fault.number).toBe(low.fault.number + 1);
    expect((await machine()).status).toBe("OFFLINE");
    expect(await prisma.downtime.findFirst({ where: { machineId: f.home.machine.id, endedAt: null } })).toMatchObject({ reason: "FAULT", faultId: high.fault.id });
    expect(await outbox("upkeep-staff")).toBeGreaterThanOrEqual(2);
    await expect(transaction((tx) => updateFault(tx, home(), { faultId: high.fault.id, assignedToId: f.away.user.id }))).rejects.toThrow("Assign someone");
    await transaction((tx) => updateFault(tx, home(), { faultId: high.fault.id, status: "IN_PROGRESS", assignedToId: f.home.user.id }));
    await expect(transaction((tx) => updateFault(tx, home(), { faultId: high.fault.id, status: "ACKNOWLEDGED" }))).rejects.toThrow("isn't allowed");
    await expect(transaction((tx) => updateFault(tx, home(), { faultId: high.fault.id, status: "RESOLVED" }))).rejects.toThrow("resolved");
    await transaction((tx) => updateFault(tx, home(), { faultId: high.fault.id, status: "RESOLVED", resolution: "Replaced fan" }));
    await expect(transaction((tx) => updateFault(tx, home(), { faultId: high.fault.id, status: "OPEN" }))).rejects.toThrow("closed");
    await expect(transaction((tx) => updateFault(tx, { spaceId: f.away.space.id, actorId: f.away.user.id }, { faultId: low.fault.id, status: "RESOLVED", resolution: "x" })))
      .rejects.toBeInstanceOf(UpkeepNotFoundError);
    const { webhookDeliveryIds } = await transaction((tx) => logMaintenance(tx, home(), { machineId: f.home.machine.id, faultId: high.fault.id, kind: "CORRECTIVE", summary: "Fan", restoreIdle: true }));
    expect(webhookDeliveryIds).toBeDefined();
    expect((await machine()).status).toBe("IDLE");
    const history = await serviceHistory(f.home.space.id, f.home.machine.id);
    expect(history.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["maintenance", "downtime", "fault", "status"]));
  });
});

describe("warranty and daily sweeps", () => {
  it("re-arms the expiry reminder when the expiry date changes and sends one reminder per expiry", async () => {
    const soon = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10);
    await transaction((tx) => saveWarranty(tx, { ...home(), machineId: f.home.machine.id }, { vendorName: "Acme", expiresOn: soon }));
    await expect(transaction((tx) => saveWarranty(tx, { ...home(), machineId: f.home.machine.id }, { startsOn: "2027-01-01", expiresOn: "2026-01-01" }))).rejects.toThrow("before the start");
    await runWarrantySweep();
    await runWarrantySweep();
    expect(await outbox("upkeep-staff")).toBe(1);
    await transaction((tx) => saveWarranty(tx, { ...home(), machineId: f.home.machine.id }, { vendorName: "Acme", expiresOn: soon }));
    expect((await prisma.warranty.findFirstOrThrow({ where: { machineId: f.home.machine.id } })).lastNotifiedAt).not.toBeNull();
    const later = new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10);
    await transaction((tx) => saveWarranty(tx, { ...home(), machineId: f.home.machine.id }, { vendorName: "Acme", expiresOn: later }));
    expect((await prisma.warranty.findFirstOrThrow({ where: { machineId: f.home.machine.id } })).lastNotifiedAt).toBeNull();
  });
  it("alerts once per due cycle and takes an overdue blocking machine out of service", async () => {
    const schedule = await transaction((tx) => createSchedule(tx, { ...home(), machineId: f.home.machine.id },
      { title: "Calibrate", trigger: "TIME", intervalDays: 30, firstDueOn: new Date(Date.now() - DAY).toISOString().slice(0, 10), blockWhenOverdue: true }));
    await runMaintenanceSweep();
    await runMaintenanceSweep();
    expect(await outbox("upkeep-staff")).toBe(1);
    expect((await machine()).status).toBe("MAINTENANCE");
    expect(await prisma.downtime.count({ where: { machineId: f.home.machine.id, endedAt: null, reason: "PLANNED_MAINTENANCE" } })).toBe(1);
    expect((await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).lastNotifiedAt).not.toBeNull();
  });
});

describe("upkeep files and reports", () => {
  it("serves maintenance files to the space's staff only", async () => {
    const { log } = await transaction((tx) => logMaintenance(tx, home(), { machineId: f.home.machine.id, kind: "INSPECTION", summary: "Checked" }));
    const key = machineFileKey(f.home.space.id, f.home.machine.id, "maintenance", "pdf");
    await transaction((tx) => addMaintenanceAttachment(tx, home(), { logId: log.id, storageKey: key, filename: "report.pdf", contentType: "application/pdf", sizeBytes: 10 }));
    expect(await resolveMachineFile(key, f.home.user.id)).toMatchObject({ public: false, kind: "maintenance", filename: "report.pdf" });
    expect(await resolveMachineFile(key, f.away.user.id)).toBeNull();
    expect(await resolveMachineFile(key, null)).toBeNull();
    expect(await resolveMachineFile(machineFileKey(f.home.space.id, f.home.machine.id, "warranty", "pdf"), f.home.user.id)).toBeNull();
  });
  it("loads every report for one space only", async () => {
    await transaction((tx) => logMaintenance(tx, home(), { machineId: f.home.machine.id, kind: "INSPECTION", summary: "Checked", cost: 700 }));
    await transaction((tx) => logMaintenance(tx, { spaceId: f.away.space.id, actorId: f.away.user.id }, { machineId: f.away.machine.id, kind: "INSPECTION", summary: "Away", cost: 9 }));
    const reports = await loadReports(f.home.space.id, new Date(Date.now() - DAY), new Date(Date.now() + DAY));
    expect(reports.maintenance).toMatchObject({ logs: 1, cost: 700 });
    expect(reports.utilisation.map((row) => row.machineId)).toEqual([f.home.machine.id]);
  });
});
