import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
import { SpaceStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveMachineFile } from "@/lib/machines/fileAccess";
import { machineFileKey } from "@/lib/storage/machineFiles";
import { loadPublicMachineView } from "@/lib/views/app__s__spaceSlug__machines__machineSlug__page";
import { loadPublicMachinesView } from "@/lib/views/app__s__spaceSlug__machines__page";
import { machinesFixture, type MachinesFixture } from "../helpers/machines-db";

let fixture: MachinesFixture;
let privateDocument: { id: string; storageKey: string };
beforeAll(async () => {
  fixture = await machinesFixture();
  const h = fixture.home;
  privateDocument = await prisma.machineDocument.create({ data: { spaceId: h.space.id, machineId: h.machine.id,
    storageKey: machineFileKey(h.space.id, h.machine.id, "documents", "txt"), title: "Private procedure", filename: "internal.txt",
    contentType: "text/plain", sizeBytes: 32, isPublic: false } });
  await prisma.machineType.update({ where: { id: h.type.id }, data: { specFields: [
    { key: "power", label: "Power", kind: "number", public: true },
    { key: "private", label: "Private spec", kind: "text", public: false },
    { key: "unmarked", label: "Unmarked spec", kind: "text" },
  ] } });
  await prisma.machine.update({ where: { id: h.machine.id }, data: {
    specs: { power: 0, private: "SECRET-SPEC", unmarked: "UNMARKED-SPEC", removed: "REMOVED-SPEC" },
    statusNote: "PRIVATE-STATUS-NOTE",
  } });
});
afterAll(async () => { await fixture?.cleanup(); });

const props = () => ({ params: Promise.resolve({ spaceSlug: fixture.home.space.slug, machineSlug: fixture.home.machine.slug }) });
const publicKeys = () => [fixture.home.photo.storageKey, fixture.home.document.storageKey];

async function expectHiddenMachine() {
  for (const key of publicKeys()) expect(await resolveMachineFile(key, null)).toBeNull();
  await expect(loadPublicMachineView(props())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
}

describe.sequential("public machine queries and file authorisation in PostgreSQL", () => {
  it.each(["PUBLIC", "UNLISTED"] as const)("shows public photos/documents in an ACTIVE %s space without internal fields", async (visibility) => {
    const h = fixture.home;
    await prisma.space.update({ where: { id: h.space.id }, data: { visibility } });
    expect(await resolveMachineFile(h.photo.storageKey, null)).toEqual({ public: true, kind: "photos", filename: null });
    expect(await resolveMachineFile(h.document.storageKey, null)).toEqual({ public: true, kind: "documents", filename: "manual.pdf" });
    expect(await resolveMachineFile(privateDocument.storageKey, null)).toBeNull();
    expect(await resolveMachineFile(privateDocument.storageKey, h.user.id)).toEqual({ public: false, kind: "documents", filename: "internal.txt" });
    expect(await resolveMachineFile(privateDocument.storageKey, fixture.away.user.id)).toBeNull();
    const list = await loadPublicMachinesView(props());
    const detail = await loadPublicMachineView(props());
    expect(list.groups.flatMap((group) => group.machines.map((machine) => machine.slug))).toEqual([h.machine.slug]);
    expect(list.groups[0].machines[0].cover).toEqual({ url: `/api/uploads/${h.photo.storageKey}`, alt: h.photo.alt });
    expect(detail.photos).toEqual([{ url: `/api/uploads/${h.photo.storageKey}`, alt: h.photo.alt }]);
    expect(detail.documents).toEqual([{ id: h.document.id, title: "Manual", kind: "MANUAL", url: `/api/uploads/${h.document.storageKey}` }]);
    expect(detail.machine.specs).toEqual([{ key: "power", label: "Power", value: "0" }]);
    for (const machine of [detail.machine, list.groups[0].machines[0]]) {
      for (const field of ["serialNumber", "notes", "statusNote", "location", "purchaseCost", "meterMinutes", "meterJobs", "createdById", "firmwareVersion"]) {
        expect(machine).not.toHaveProperty(field);
      }
    }
    const payload = JSON.stringify([list, detail]);
    for (const value of ["PRIVATE-SERIAL", "PRIVATE-NOTES", "PRIVATE-STATUS-NOTE", "SECRET-SPEC", "UNMARKED-SPEC", "REMOVED-SPEC", "Private procedure", privateDocument.storageKey]) {
      expect(payload).not.toContain(value);
    }
  });

  it.each([
    { isPublic: false, retiredAt: null },
    { isPublic: true, retiredAt: new Date() },
  ])("hides a private or retired machine even with public file rows (%j)", async (data) => {
    const h = fixture.home;
    await prisma.machine.update({ where: { id: h.machine.id }, data });
    try {
      await expectHiddenMachine();
      expect((await loadPublicMachinesView(props())).groups).toEqual([]);
    } finally {
      await prisma.machine.update({ where: { id: h.machine.id }, data: { isPublic: true, retiredAt: null } });
    }
  });

  it.each(Object.values(SpaceStatus).filter((status) => status !== "ACTIVE"))("hides machines and their files when the space is %s", async (status) => {
    const h = fixture.home;
    await prisma.space.update({ where: { id: h.space.id }, data: { status } });
    try {
      await expectHiddenMachine();
      await expect(loadPublicMachinesView(props())).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    } finally {
      await prisma.space.update({ where: { id: h.space.id }, data: { status: "ACTIVE" } });
    }
  });

  it("allows only active staff of the owning space to fetch private photos and documents", async () => {
    const h = fixture.home;
    const a = fixture.away;
    await prisma.machine.update({ where: { id: h.machine.id }, data: { isPublic: false } });
    try {
      for (const key of [...publicKeys(), privateDocument.storageKey]) {
        expect(await resolveMachineFile(key, null)).toBeNull();
        expect(await resolveMachineFile(key, a.user.id)).toBeNull();
        expect(await resolveMachineFile(key, h.user.id)).toMatchObject({ public: false });
      }
      // Makers and pending/blocked makers do not inherit staff file access.
      for (const status of ["ACTIVE", "PENDING", "BLOCKED"] as const) {
        await prisma.spaceMember.update({ where: { userId_spaceId: { userId: h.user.id, spaceId: h.space.id } }, data: { role: "MEMBER", status } });
        expect(await resolveMachineFile(privateDocument.storageKey, h.user.id)).toBeNull();
      }
    } finally {
      await prisma.spaceMember.update({ where: { userId_spaceId: { userId: h.user.id, spaceId: h.space.id } }, data: { role: "MACHINE_MANAGER", status: "ACTIVE" } });
      await prisma.machine.update({ where: { id: h.machine.id }, data: { isPublic: true } });
    }
  });

  it("scopes public detail lookup to its space and rejects forged, missing or malformed file keys", async () => {
    const h = fixture.home;
    const a = fixture.away;
    await expect(loadPublicMachineView({ params: Promise.resolve({ spaceSlug: h.space.slug, machineSlug: a.machine.slug }) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    for (const key of [h.photo.storageKey.replace(h.space.id, a.space.id), h.photo.storageKey.replace(h.machine.id, a.machine.id),
      machineFileKey(h.space.id, h.machine.id, "photos", "webp"), "../private.pdf"]) {
      expect(await resolveMachineFile(key, null)).toBeNull();
      expect(await resolveMachineFile(key, h.user.id)).toBeNull();
    }
  });
});
