import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id }, authenticatedAt: Date.now() } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));

import type { Machine, MachineType, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as machines from "@/lib/machines/machines";
import * as types from "@/lib/machines/types";
import { JobGuardError, JobNotFoundError } from "@/lib/jobs";
import { logMaintenance, reportFault, updateFault } from "@/lib/upkeep";
import { UpkeepError, UpkeepNotFoundError } from "@/lib/upkeep/context";
import { PrinterError, saveConnection } from "@/lib/printers/connections";
import { loadReports } from "@/lib/reports/load";
import { auditRows } from "@/lib/auditLog";
import { savePricingRuleAction, deletePricingRuleAction } from "@/app/actions/job-settings";
import { loadMachineView } from "@/lib/views/app__dashboard__spaceSlug__machines__machineSlug__page";
import { loadMachinesView } from "@/lib/views/app__dashboard__spaceSlug__machines__page";
import { loadMachineTypeView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__types__typeSlug__page";
import { loadStaffJobView } from "@/lib/views/app__dashboard__spaceSlug__jobs__number__page";
import { loadJobsView } from "@/lib/views/app__dashboard__spaceSlug__jobs__page";
import { loadFaultView } from "@/lib/views/app__dashboard__spaceSlug__maintenance__faults__number__page";
import { DEFAULT_FILE_POLICY } from "@/lib/machines/filePolicy";
import { machineDetails, transaction } from "../helpers/machines-db";
import { jobsFixture, type JobsFixture } from "../helpers/jobs-db";

/**
 * A machine type manager acts only on the machine types assigned to them. Everything outside answers as
 * not found, exactly like another space's records.
 */
let f: JobsFixture;
let manager: User;
let otherType: MachineType;
let otherMachine: Machine;
const NOT_FOUND = "NEXT_HTTP_ERROR_FALLBACK;404";
const own = () => ({ spaceId: f.home.space.id, actorId: manager.id });

beforeAll(async () => {
  f = await jobsFixture();
  const h = f.home;
  manager = await prisma.user.create({ data: { email: `type-manager-${h.space.id}@example.test`, emailVerified: new Date(), mfaEnabledAt: new Date() } });
  await prisma.spaceMember.create({ data: { spaceId: h.space.id, userId: manager.id, role: "TYPE_MANAGER" } });
  otherType = await prisma.machineType.create({ data: { spaceId: h.space.id, slug: "cnc", name: "CNC router", filePolicy: DEFAULT_FILE_POLICY } });
  otherMachine = await prisma.machine.create({ data: { ...machineDetails, spaceId: h.space.id, typeId: otherType.id, slug: "other-machine", name: "CNC one" } });
  await prisma.typeManagerAssignment.create({ data: { spaceId: h.space.id, machineTypeId: h.type.id, userId: manager.id, createdById: h.user.id } });
  identity.id = manager.id;
});
afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { actorUserId: manager?.id } });
  await f?.cleanup();
  await prisma.user.deleteMany({ where: { id: manager?.id } });
});

describe.sequential("machine type manager scope in the domain", () => {
  it("changes their own type's machines and settings, and finds nothing outside it", async () => {
    await transaction((tx) => machines.changeMachineStatus(tx, { ...own(), machineId: f.home.machine.id, status: "OFFLINE", note: "" }));
    await expect(transaction((tx) => machines.changeMachineStatus(tx, { ...own(), machineId: otherMachine.id, status: "OFFLINE", note: "" }))).rejects.toThrow(machines.MachineNotFoundError);
    await expect(transaction((tx) => machines.updateMachine(tx, { ...machineDetails, ...own(), machineId: otherMachine.id }))).rejects.toThrow(machines.MachineNotFoundError);
    await expect(transaction((tx) => machines.createMachine(tx, { ...machineDetails, ...own(), typeId: otherType.id, isPublic: false, acceptsJobs: true }))).rejects.toThrow(types.TypeNotFoundError);
    const created = await transaction((tx) => machines.createMachine(tx, { ...machineDetails, name: "Second laser", ...own(), typeId: f.home.type.id, isPublic: false, acceptsJobs: false }));
    expect((await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).typeId).toBe(f.home.type.id);
    const queue = { section: "queue" as const, values: { acceptsJobs: true, requiresApproval: true, allocationPolicy: "FIRST_IDLE" as const, maxConcurrentJobs: null, requesterPicksMachine: true, maxOpenJobsPerRequester: null } };
    await expect(transaction((tx) => types.updateMachineType(tx, { ...own(), typeId: otherType.id, change: queue }))).rejects.toThrow(types.TypeNotFoundError);
    await transaction((tx) => types.updateMachineType(tx, { ...own(), typeId: f.home.type.id, change: queue }));
    await prisma.machine.update({ where: { id: f.home.machine.id }, data: { status: "IDLE" } });
  });

  it("keeps upkeep, faults and printers inside their types", async () => {
    await expect(transaction((tx) => logMaintenance(tx, own(), { machineId: otherMachine.id, kind: "INSPECTION", summary: "Checked" }))).rejects.toThrow(UpkeepNotFoundError);
    await transaction((tx) => logMaintenance(tx, own(), { machineId: f.home.machine.id, kind: "INSPECTION", summary: "Checked" }));
    await expect(transaction((tx) => reportFault(tx, own(), { machineId: otherMachine.id, severity: "LOW", title: "Noise" }))).rejects.toThrow(UpkeepNotFoundError);
    const { fault } = await transaction((tx) => reportFault(tx, { spaceId: f.home.space.id, actorId: f.home.user.id }, { machineId: otherMachine.id, severity: "LOW", title: "Noise" }));
    await expect(transaction((tx) => updateFault(tx, own(), { faultId: fault.id, status: "ACKNOWLEDGED" }))).rejects.toThrow(UpkeepNotFoundError);
    // Nobody can hand a fault to a type manager who can't open it.
    await expect(transaction((tx) => updateFault(tx, { spaceId: f.home.space.id, actorId: f.home.user.id }, { faultId: fault.id, assignedToId: manager.id }))).rejects.toThrow(UpkeepError);
    await expect(loadFaultView({ params: Promise.resolve({ spaceSlug: f.home.space.slug, number: String(fault.number) }) })).rejects.toThrow(NOT_FOUND);
    await expect(transaction((tx) => saveConnection(tx, own(), { machineId: otherMachine.id, adapter: "SIMULATED", enabled: true, settings: {} }))).rejects.toThrow(PrinterError);
  });

  it("reviews jobs of their types only, and acts on their own request elsewhere only as its requester", async () => {
    const mine = (await f.submit()).job;
    expect((await f.act(mine.id, { kind: "approve", estimatedMinutes: 5 }, undefined, manager.id)).job.status).toBe("APPROVED");
    await prisma.machineType.update({ where: { id: otherType.id }, data: { acceptsJobs: true, requiresApproval: true } });
    await prisma.machine.update({ where: { id: otherMachine.id }, data: { acceptsJobs: true } });
    const theirs = (await f.submit({ typeId: otherType.id })).job;
    await expect(f.act(theirs.id, { kind: "approve", estimatedMinutes: 5 }, undefined, manager.id)).rejects.toThrow(JobNotFoundError);
    await expect(loadStaffJobView({ params: Promise.resolve({ spaceSlug: f.home.space.slug, number: String(theirs.number) }) })).rejects.toThrow(NOT_FOUND);
    const board = await loadJobsView({ params: Promise.resolve({ spaceSlug: f.home.space.slug }), searchParams: Promise.resolve({}) });
    expect(board.jobs.map((job) => job.id)).toContain(mine.id);
    expect(board.jobs.map((job) => job.id)).not.toContain(theirs.id);
    expect(board.types.map((type) => type.id)).toEqual([f.home.type.id]);

    const ownRequest = (await f.submit({ typeId: otherType.id }, undefined)).job;
    await prisma.job.update({ where: { id: ownRequest.id }, data: { requesterId: manager.id } });
    await expect(f.act(ownRequest.id, { kind: "approve", estimatedMinutes: 5 }, undefined, manager.id)).rejects.toThrow(JobGuardError);
  });
});

describe.sequential("machine type manager scope in pages, settings and reports", () => {
  it("lists and opens only their types' machines and types", async () => {
    const list = await loadMachinesView({ params: Promise.resolve({ spaceSlug: f.home.space.slug }), searchParams: Promise.resolve({}) });
    expect(list.types.map((type) => type.id)).toEqual([f.home.type.id]);
    expect(list.machines.every((machine) => machine.id !== otherMachine.id)).toBe(true);
    await expect(loadMachineView({ params: Promise.resolve({ spaceSlug: f.home.space.slug, machineSlug: otherMachine.slug }) })).rejects.toThrow(NOT_FOUND);
    await expect(loadMachineTypeView({ params: Promise.resolve({ spaceSlug: f.home.space.slug, typeSlug: otherType.slug }) })).rejects.toThrow(NOT_FOUND);
    const editor = await loadMachineTypeView({ params: Promise.resolve({ spaceSlug: f.home.space.slug, typeSlug: f.home.type.slug }) });
    expect(editor).toMatchObject({ canManage: true, canArchive: false });
  });

  it("prices only their types and machines, never the space default", async () => {
    const base = { spaceSlug: f.home.space.slug, audience: "MEMBER", mode: "FLAT", flatFee: 100, timeRatePerHour: 0, materialRate: "0", setupFee: 0, minimumCharge: 0,
      timeIncrementMinutes: 1, depositMode: "NONE", depositValue: 0, paymentTiming: null };
    expect(await savePricingRuleAction({ ...base, typeId: null, machineId: null })).toMatchObject({ ok: false });
    expect(await savePricingRuleAction({ ...base, typeId: otherType.id, machineId: null })).toMatchObject({ ok: false });
    expect(await savePricingRuleAction({ ...base, typeId: null, machineId: otherMachine.id })).toMatchObject({ ok: false });
    expect(await savePricingRuleAction({ ...base, typeId: f.home.type.id, machineId: null })).toEqual({ ok: true });
    const foreign = await prisma.pricingRule.create({ data: { spaceId: f.home.space.id, typeId: otherType.id, mode: "FLAT", flatFee: 1 } });
    expect(await deletePricingRuleAction({ spaceSlug: f.home.space.slug, ruleId: foreign.id })).toMatchObject({ ok: false });
    expect(await prisma.pricingRule.count({ where: { id: foreign.id } })).toBe(1);
    await prisma.pricingRule.deleteMany({ where: { spaceId: f.home.space.id } });
  });

  it("reports on their types only and reads only their part of the audit log", async () => {
    const from = new Date(Date.now() - 86_400_000), to = new Date(Date.now() + 86_400_000);
    const scoped = await loadReports(f.home.space.id, from, to, [f.home.type.id]);
    expect(scoped.utilisation.map((row) => row.name)).not.toContain(otherMachine.name);
    expect((await loadReports(f.home.space.id, from, to)).utilisation.map((row) => row.name)).toContain(otherMachine.name);

    await prisma.auditEvent.create({ data: { spaceId: f.home.space.id, action: "machine.updated", actorUserId: f.home.user.id, targetType: "Machine", targetId: otherMachine.id } });
    await prisma.auditEvent.create({ data: { spaceId: f.home.space.id, action: "machine.updated", actorUserId: f.home.user.id, targetType: "Machine", targetId: f.home.machine.id } });
    const visible = await auditRows(f.home.space.id, {}, 500, { userId: manager.id, typeScope: [f.home.type.id] });
    expect(visible.some((row) => row.target === `Machine ${otherMachine.id}`)).toBe(false);
    expect(visible.some((row) => row.target === `Machine ${f.home.machine.id}`)).toBe(true);
    expect((await auditRows(f.home.space.id, {}, 500)).some((row) => row.target === `Machine ${otherMachine.id}`)).toBe(true);
  });
});
