import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMachine, updateMachine, changeMachineStatus, setMachineFlags, setMachineRetired } from "@/lib/machines/machines";
import { createMachineType, updateMachineType, setMachineTypeArchived, reorderMachineTypes } from "@/lib/machines/types";
import { loadFullType } from "@/lib/machines/queries";
import type { TypeSection } from "@/lib/machines/schemas";
import { audited, machineDetails, machinesFixture, transaction, type MachinesFixture } from "../helpers/machines-db";

let fixture: MachinesFixture;
beforeAll(async () => { fixture = await machinesFixture(); });
afterAll(async () => { await fixture?.cleanup(); });

describe.sequential("machine lifecycle in PostgreSQL", () => {
  it("creates, edits, publishes, changes status, retires and restores with an audit for each", async () => {
    const h = fixture.home;
    const context = { spaceId: h.space.id, actorId: h.user.id };
    const created = await audited(h, "machine.created", null, () => transaction((tx) => createMachine(tx, {
      ...machineDetails, ...context, typeId: h.type.id, isPublic: false, acceptsJobs: true,
    })));
    const input = { ...context, machineId: created.id };
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      ...machineDetails, spaceId: h.space.id, typeId: h.type.id, status: "IDLE", isPublic: false, createdById: h.user.id,
    });
    await audited(h, "machine.updated", created.id, () => transaction((tx) => updateMachine(tx, {
      ...machineDetails, ...input, name: "Renamed laser", serialNumber: "SERIAL-2", notes: "Updated notes", purchaseCost: 23456,
    })));
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      name: "Renamed laser", serialNumber: "SERIAL-2", notes: "Updated notes", purchaseCost: 23456, slug: created.slug, typeId: h.type.id,
    });
    await audited(h, "machine.flags_changed", created.id, () => transaction((tx) => setMachineFlags(tx, { ...input, isPublic: true, acceptsJobs: false })));
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ isPublic: true, acceptsJobs: false });
    const status = await audited(h, "machine.status_changed", created.id, () => transaction((tx) => changeMachineStatus(tx, {
      ...input, status: "MAINTENANCE", note: "Replace belt",
    })), { from: "IDLE", to: "MAINTENANCE" });
    expect(status.changed).toBe(true);
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({ status: "MAINTENANCE", statusNote: "Replace belt" });
    await audited(h, "machine.retired", created.id, () => transaction((tx) => setMachineRetired(tx, { ...input, retired: true })));
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      retiredAt: expect.any(Date), status: "OFFLINE", isPublic: false, acceptsJobs: false,
    });
    const audits = await prisma.auditEvent.count({ where: { spaceId: h.space.id } });
    await expect(transaction((tx) => setMachineFlags(tx, { ...input, isPublic: true }))).rejects.toThrow("Check the highlighted fields.");
    await expect(transaction((tx) => changeMachineStatus(tx, { ...input, status: "IDLE", note: "" }))).rejects.toThrow("Check the highlighted fields.");
    expect(await prisma.auditEvent.count({ where: { spaceId: h.space.id } })).toBe(audits);
    await audited(h, "machine.unretired", created.id, () => transaction((tx) => setMachineRetired(tx, { ...input, retired: false })));
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      retiredAt: null, status: "IDLE", statusNote: "", isPublic: false, acceptsJobs: false,
    });
  });

  it("audits edits to the status note even when the status stays the same", async () => {
    const h = fixture.home;
    await audited(h, "machine.updated", h.machine.id, () => transaction((tx) => changeMachineStatus(tx, {
      spaceId: h.space.id, actorId: h.user.id, machineId: h.machine.id, status: "IDLE", note: "Internal handover note",
    })));
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: h.machine.id } })).toMatchObject({ statusNote: "Internal handover note" });
    const before = await prisma.auditEvent.count({ where: { targetId: h.machine.id } });
    await transaction((tx) => changeMachineStatus(tx, {
      spaceId: h.space.id, actorId: h.user.id, machineId: h.machine.id, status: "IDLE", note: "Internal handover note",
    }));
    expect(await prisma.auditEvent.count({ where: { targetId: h.machine.id } })).toBe(before);
  });

  it("rolls back the machine and its audit together", async () => {
    const h = fixture.home;
    const before = await prisma.auditEvent.count({ where: { spaceId: h.space.id } });
    await expect(transaction(async (tx) => {
      await updateMachine(tx, { ...machineDetails, spaceId: h.space.id, actorId: h.user.id, machineId: h.machine.id, name: "Rollback name" });
      throw new Error("Abort transaction");
    })).rejects.toThrow("Abort transaction");
    expect((await prisma.machine.findUniqueOrThrow({ where: { id: h.machine.id } })).name).toBe(h.machine.name);
    expect(await prisma.auditEvent.count({ where: { spaceId: h.space.id } })).toBe(before);
  });

  it("validates typed specs and keeps stored keys after the type removes them", async () => {
    const h = fixture.home;
    const input = { spaceId: h.space.id, actorId: h.user.id, machineId: h.machine.id };
    await prisma.machineType.update({ where: { id: h.type.id }, data: { specFields: [
      { key: "power", label: "Power", kind: "number", min: 0, public: true },
      { key: "volume", label: "Volume", kind: "number", required: true },
    ] } });
    await prisma.machine.update({ where: { id: h.machine.id }, data: { specs: { removed: "Preserved history" } } });
    const before = await prisma.auditEvent.count({ where: { spaceId: h.space.id } });
    await expect(transaction((tx) => updateMachine(tx, { ...machineDetails, ...input, specs: { power: -1 } })))
      .rejects.toMatchObject({ fieldErrors: { "specs.power": expect.any(Array) } });
    expect(await prisma.auditEvent.count({ where: { spaceId: h.space.id } })).toBe(before);
    const saved = await audited(h, "machine.updated", h.machine.id, () => transaction((tx) => updateMachine(tx, {
      ...machineDetails, ...input, specs: { power: 0 },
    })));
    expect(saved.missingSpecs).toEqual(["volume"]);
    expect((await prisma.machine.findUniqueOrThrow({ where: { id: h.machine.id } })).specs).toEqual({ power: 0, removed: "Preserved history" });
  });
});

describe.sequential("machine type settings in PostgreSQL", () => {
  it("creates blank, preset and copied types, preserving the copied configuration", async () => {
    const h = fixture.home;
    const context = { spaceId: h.space.id, actorId: h.user.id };
    const blank = await audited(h, "machine_type.created", null, () => transaction((tx) => createMachineType(tx, { ...context, name: "Blank type", from: { kind: "blank" } })));
    expect(await loadFullType(h.space.id, { id: blank.id })).toMatchObject({ name: "Blank type", specFields: [], archived: false });
    const preset = await audited(h, "machine_type.created", null, () => transaction((tx) => createMachineType(tx, { ...context, name: "Printer type", from: { kind: "preset", presetKey: "fdm_printer" } })));
    const copy = await audited(h, "machine_type.created", null, () => transaction((tx) => createMachineType(tx, { ...context, name: "Copied printer", from: { kind: "type", typeId: preset.id } })));
    const original = await loadFullType(h.space.id, { id: preset.id });
    expect(original?.specFields.length).toBeGreaterThan(0);
    expect(await loadFullType(h.space.id, { id: copy.id })).toMatchObject({
      specFields: original!.specFields, filePolicy: original!.filePolicy, materials: original!.materials, consumableUnit: "GRAMS",
    });
  });

  const sections: TypeSection[] = [
    { section: "details", values: { name: "Edited laser", icon: "wrench", description: "Edited description" } },
    { section: "specFields", values: { specFields: [{ key: "power", label: "Power", kind: "number", public: true }] } },
    { section: "requestFields", values: { requestFields: [{ key: "quantity", label: "Quantity", kind: "number" }] } },
    { section: "filePolicy", values: { filePolicy: { extensions: ["pdf"], maxBytes: 1024, maxFiles: 1, required: true } } },
    { section: "catalogue", values: { materials: ["Plywood"], colours: ["Natural"], meteringUnit: "MINUTES", consumableUnit: "SHEETS" } },
    { section: "queue", values: { acceptsJobs: false, requiresApproval: false, allocationPolicy: "FIRST_IDLE", maxConcurrentJobs: 2, requesterPicksMachine: true, maxOpenJobsPerRequester: 3 } },
  ];
  it.each(sections)("saves and audits the $section section", async (change) => {
    const h = fixture.home;
    await audited(h, "SPACE_SETTINGS_CHANGED", h.type.id, () => transaction((tx) => updateMachineType(tx, {
      spaceId: h.space.id, actorId: h.user.id, typeId: h.type.id, change,
    })), { area: `machine.types.${change.section}` });
    expect(await prisma.machineType.findUniqueOrThrow({ where: { id: h.type.id } })).toMatchObject(change.values);
  });

  it("archives and restores a type without deleting its machines, and reorders all types", async () => {
    const h = fixture.home;
    const input = { spaceId: h.space.id, actorId: h.user.id, typeId: h.type.id };
    for (const archived of [true, false]) {
      await audited(h, "SPACE_SETTINGS_CHANGED", h.type.id, () => transaction((tx) => setMachineTypeArchived(tx, { ...input, archived })), { area: "machine.types.archive" });
      expect((await loadFullType(h.space.id, { id: h.type.id }))?.archived).toBe(archived);
      expect(await prisma.machine.count({ where: { id: h.machine.id } })).toBe(1);
      if (archived) await expect(transaction((tx) => createMachine(tx, {
        ...machineDetails, ...input, isPublic: false, acceptsJobs: true,
      }))).rejects.toThrow("Check the highlighted fields.");
    }
    const types = await prisma.machineType.findMany({ where: { spaceId: h.space.id }, orderBy: { sortOrder: "asc" } });
    const typeIds = types.map((type) => type.id).reverse();
    await audited(h, "SPACE_SETTINGS_CHANGED", h.space.id, () => transaction((tx) => reorderMachineTypes(tx, { ...input, typeIds })), { area: "machine.types.order" });
    expect(await prisma.machineType.findMany({ where: { spaceId: h.space.id }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } }))
      .toEqual(typeIds.map((id, index) => ({ id, sortOrder: (index + 1) * 10 })));
  });
});
