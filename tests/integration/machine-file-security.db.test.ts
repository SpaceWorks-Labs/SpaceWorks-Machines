import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resolveMachineFile } from "@/lib/machines/fileAccess";
import { machineFileKey } from "@/lib/storage/machineFiles";
import { DEFAULT_FILE_POLICY } from "@/lib/machines/filePolicy";
import { machinesFixture, type MachinesFixture } from "../helpers/machines-db";

let f: MachinesFixture;
let ownKeys: string[];
let otherKeys: string[];

async function privateFiles(spaceId: string, machineId: string, number: number) {
  await prisma.machine.update({ where: { id: machineId }, data: { isPublic: false } });
  const photoKey = machineFileKey(spaceId, machineId, "photos", "webp");
  await prisma.machinePhoto.create({ data: { spaceId, machineId, storageKey: photoKey } });
  const key = (kind: "documents" | "maintenance" | "warranty" | "faults") => machineFileKey(spaceId, machineId, kind, kind === "faults" ? "webp" : "pdf");
  const document = await prisma.machineDocument.create({ data: { spaceId, machineId, storageKey: key("documents"), title: "Private manual", filename: "private.pdf", contentType: "application/pdf", sizeBytes: 1 } });
  const log = await prisma.maintenanceLog.create({ data: { spaceId, machineId, summary: "Service" } });
  const attachment = await prisma.maintenanceAttachment.create({ data: { spaceId, logId: log.id, storageKey: key("maintenance"), filename: "service.pdf", contentType: "application/pdf", sizeBytes: 1 } });
  const warranty = await prisma.warranty.create({ data: { spaceId, machineId } });
  const warrantyFile = await prisma.warrantyDocument.create({ data: { spaceId, warrantyId: warranty.id, storageKey: key("warranty"), filename: "warranty.pdf", contentType: "application/pdf", sizeBytes: 1 } });
  const fault = await prisma.faultReport.create({ data: { spaceId, machineId, number, title: "Fault" } });
  const photo = await prisma.faultPhoto.create({ data: { spaceId, faultId: fault.id, storageKey: key("faults") } });
  return [photoKey, document.storageKey, attachment.storageKey, warrantyFile.storageKey, photo.storageKey];
}

beforeAll(async () => {
  f = await machinesFixture();
  const h = f.home;
  ownKeys = await privateFiles(h.space.id, h.machine.id, 1);
  const type = await prisma.machineType.create({ data: { spaceId: h.space.id, slug: "other", name: "Other type", filePolicy: DEFAULT_FILE_POLICY } });
  const machine = await prisma.machine.create({ data: { spaceId: h.space.id, typeId: type.id, slug: "other", name: "Other machine" } });
  otherKeys = await privateFiles(h.space.id, machine.id, 2);
});
afterAll(async () => { await f?.cleanup(); });

describe.sequential("private machine files", () => {
  it("requires current staff MFA for manuals, maintenance, warranties and faults", async () => {
    for (const key of ownKeys) expect(await resolveMachineFile(key, f.home.user.id)).toMatchObject({ public: false });
    await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: null } });
    for (const key of ownKeys) expect(await resolveMachineFile(key, f.home.user.id)).toBeNull();
    await prisma.user.update({ where: { id: f.home.user.id }, data: { mfaEnabledAt: new Date() } });
  });

  it("restricts direct URLs to assigned types and applies scope revocation immediately", async () => {
    const h = f.home;
    await prisma.spaceMember.update({ where: { userId_spaceId: { userId: h.user.id, spaceId: h.space.id } }, data: { role: "TYPE_MANAGER" } });
    await prisma.typeManagerAssignment.create({ data: { spaceId: h.space.id, userId: h.user.id, machineTypeId: h.type.id } });
    for (const key of ownKeys) expect(await resolveMachineFile(key, h.user.id)).toMatchObject({ public: false });
    for (const key of otherKeys) expect(await resolveMachineFile(key, h.user.id)).toBeNull();
    await prisma.typeManagerAssignment.deleteMany({ where: { spaceId: h.space.id, userId: h.user.id } });
    for (const key of ownKeys) expect(await resolveMachineFile(key, h.user.id)).toBeNull();
  });
});
