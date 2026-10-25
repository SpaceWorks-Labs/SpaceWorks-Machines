import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: identity.id } }) }));

import { prisma } from "@/lib/db";
import * as machines from "@/lib/machines/machines";
import * as types from "@/lib/machines/types";
import * as pools from "@/lib/consumables/pools";
import * as files from "@/lib/machines/files";
import { loadFullType, machineStatusCounts } from "@/lib/machines/queries";
import { loadMachineView } from "@/lib/views/app__dashboard__spaceSlug__machines__machineSlug__page";
import { loadMachinesView } from "@/lib/views/app__dashboard__spaceSlug__machines__page";
import { loadMachineTypeView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__types__typeSlug__page";
import { loadMachineSettingsView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__page";
import { loadConsumablePoolView } from "@/lib/views/app__dashboard__spaceSlug__consumables__poolId__page";
import { loadConsumablesView } from "@/lib/views/app__dashboard__spaceSlug__consumables__page";
import { machineDetails, machinesFixture, poolDetails, transaction, type MachinesFixture } from "../helpers/machines-db";

let fixture: MachinesFixture;
beforeAll(async () => { fixture = await machinesFixture(); identity.id = fixture.home.user.id; });
afterAll(async () => { await fixture?.cleanup(); });

type ForeignCall = (tx: Prisma.TransactionClient, h: MachinesFixture["home"], a: MachinesFixture["away"]) => Promise<unknown>;
const context = (h: MachinesFixture["home"]) => ({ spaceId: h.space.id, actorId: h.user.id });
const calls: Array<[string, ForeignCall]> = [
  ["createMachine with foreign type", (tx, h, a) => machines.createMachine(tx, { ...machineDetails, ...context(h), typeId: a.type.id, isPublic: false, acceptsJobs: true })],
  ["updateMachine", (tx, h, a) => machines.updateMachine(tx, { ...machineDetails, ...context(h), machineId: a.machine.id })],
  ["changeMachineStatus", (tx, h, a) => machines.changeMachineStatus(tx, { ...context(h), machineId: a.machine.id, status: "OFFLINE", note: "" })],
  ["setMachineRetired", (tx, h, a) => machines.setMachineRetired(tx, { ...context(h), machineId: a.machine.id, retired: true })],
  ["setMachineFlags", (tx, h, a) => machines.setMachineFlags(tx, { ...context(h), machineId: a.machine.id, isPublic: false })],
  ["copy type", (tx, h, a) => types.createMachineType(tx, { ...context(h), name: "Foreign copy", from: { kind: "type", typeId: a.type.id } })],
  ["updateMachineType", (tx, h, a) => types.updateMachineType(tx, { ...context(h), typeId: a.type.id,
    change: { section: "details", values: { name: "Foreign edit", icon: "wrench", description: "" } } })],
  ["setMachineTypeArchived", (tx, h, a) => types.setMachineTypeArchived(tx, { ...context(h), typeId: a.type.id, archived: true })],
  ["reorderMachineTypes", (tx, h, a) => types.reorderMachineTypes(tx, { ...context(h), typeIds: [a.type.id] })],
  ["createPool with foreign machine", (tx, h, a) => pools.createPool(tx, { ...poolDetails, ...context(h), unit: "GRAMS", initialQuantity: "1", binding: { kind: "machine", machineId: a.machine.id } })],
  ["createPool with foreign type", (tx, h, a) => pools.createPool(tx, { ...poolDetails, ...context(h), unit: "GRAMS", initialQuantity: "1", binding: { kind: "type", typeId: a.type.id } })],
  ["updatePool", (tx, h, a) => pools.updatePool(tx, { ...poolDetails, ...context(h), poolId: a.pool.id })],
  ["restockPool", (tx, h, a) => pools.restockPool(tx, { ...context(h), poolId: a.pool.id, quantity: "1" })],
  ["correctPool", (tx, h, a) => pools.correctPool(tx, { ...context(h), poolId: a.pool.id, delta: "1", reason: "Count" })],
  ["retirePool", (tx, h, a) => pools.retirePool(tx, { ...context(h), poolId: a.pool.id, reason: "Empty" })],
  ["setPoolPublic", (tx, h, a) => pools.setPoolPublic(tx, { ...context(h), poolId: a.pool.id, isPublic: false })],
  ["addMachinePhoto", (tx, h, a) => files.addMachinePhoto(tx, { ...context(h), machineId: a.machine.id, storageKey: "unused", alt: "", width: null, height: null })],
  ["updateMachinePhoto", (tx, h, a) => files.updateMachinePhoto(tx, { ...context(h), photoId: a.photo.id, alt: "Changed" })],
  ["removeMachinePhoto", (tx, h, a) => files.removeMachinePhoto(tx, { ...context(h), photoId: a.photo.id })],
  ["reorderMachinePhotos with foreign machine", (tx, h, a) => files.reorderMachinePhotos(tx, { ...context(h), machineId: a.machine.id, photoIds: [a.photo.id] })],
  ["reorderMachinePhotos with foreign photo", (tx, h, a) => files.reorderMachinePhotos(tx, { ...context(h), machineId: h.machine.id, photoIds: [a.photo.id] })],
  ["addMachineDocument", (tx, h, a) => files.addMachineDocument(tx, { ...context(h), machineId: a.machine.id, storageKey: "unused",
    title: "Manual", kind: "MANUAL", isPublic: true, filename: "manual.pdf", contentType: "application/pdf", sizeBytes: 32 })],
  ["updateMachineDocument", (tx, h, a) => files.updateMachineDocument(tx, { ...context(h), documentId: a.document.id, title: "Changed", kind: "MANUAL", isPublic: false })],
  ["removeMachineDocument", (tx, h, a) => files.removeMachineDocument(tx, { ...context(h), documentId: a.document.id })],
];

describe.sequential("machine tenant isolation", () => {
  it.each(calls)("%s treats another tenant's id as not found", async (_name, run) => {
    const h = fixture.home;
    const a = fixture.away;
    const before = await prisma.auditEvent.count({ where: { spaceId: { in: [h.space.id, a.space.id] } } });
    await expect(transaction((tx) => run(tx, h, a))).rejects.toThrow(/not found\./i);
    expect(await prisma.machine.findUniqueOrThrow({ where: { id: a.machine.id } })).toEqual(a.machine);
    expect(await prisma.machineType.findUniqueOrThrow({ where: { id: a.type.id } })).toEqual(a.type);
    expect(await prisma.consumablePool.findUniqueOrThrow({ where: { id: a.pool.id } })).toEqual(a.pool);
    expect(await prisma.machinePhoto.findUniqueOrThrow({ where: { id: a.photo.id } })).toEqual(a.photo);
    expect(await prisma.machineDocument.findUniqueOrThrow({ where: { id: a.document.id } })).toEqual(a.document);
    expect(await prisma.auditEvent.count({ where: { spaceId: { in: [h.space.id, a.space.id] } } })).toBe(before);
  });

  it("returns not found for foreign ids/slugs in detail loaders and type queries", async () => {
    const h = fixture.home;
    const a = fixture.away;
    const params = Promise.resolve({ spaceSlug: h.space.slug, machineSlug: a.machine.slug, typeSlug: a.type.slug, poolId: a.pool.id });
    await expect(loadMachineView({ params })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(loadMachineTypeView({ params })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    await expect(loadConsumablePoolView({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(await loadFullType(h.space.id, { id: a.type.id })).toBeNull();
    expect(await loadFullType(h.space.id, { slug: a.type.slug })).toBeNull();
  });

  it("scopes all list loaders and counts to the authenticated space", async () => {
    const h = fixture.home;
    const a = fixture.away;
    const params = Promise.resolve({ spaceSlug: h.space.slug });
    const catalogue = await loadMachinesView({ params, searchParams: Promise.resolve({ type: a.type.id }) });
    expect(catalogue.machines.map((row) => row.id)).toEqual([h.machine.id]);
    expect(catalogue.types.map((row) => row.id)).toEqual([h.type.id]);
    expect((await machineStatusCounts(h.space.id)).total).toBe(1);
    expect((await loadMachineSettingsView({ params })).types.map((row) => row.id)).toEqual([h.type.id]);
    const stock = await loadConsumablesView({ params });
    expect(stock.pools.map((row) => row.id)).toEqual([h.pool.id]);
    expect(stock.machines.map((row) => row.id)).toEqual([h.machine.id]);
    expect(stock.types.map((row) => row.id)).toEqual([h.type.id]);
  });

  it("prevents staff opening another space through every staff loader", async () => {
    const a = fixture.away;
    const params = Promise.resolve({ spaceSlug: a.space.slug, machineSlug: a.machine.slug, typeSlug: a.type.slug, poolId: a.pool.id });
    const searchParams = Promise.resolve({});
    for (const run of [() => loadMachinesView({ params, searchParams }), () => loadMachineView({ params }),
      () => loadMachineSettingsView({ params }), () => loadMachineTypeView({ params }),
      () => loadConsumablesView({ params }), () => loadConsumablePoolView({ params, searchParams })]) {
      await expect(run()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    }
  });
});
