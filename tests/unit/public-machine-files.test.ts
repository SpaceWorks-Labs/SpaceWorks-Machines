import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ photo: vi.fn(), document: vi.fn(), member: vi.fn(), download: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  machinePhoto: { findFirst: mocks.photo }, machineDocument: { findFirst: mocks.document }, spaceMember: { findUnique: mocks.member },
} }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/storage/machineFiles", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/storage/machineFiles")>(), downloadMachineFile: mocks.download,
}));

import { resolveMachineFile } from "@/lib/machines/fileAccess";
import { GET } from "@/app/api/uploads/[...key]/route";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const photoKey = `spaces/space-1/machines/machine-1/photos/${uuid}.webp`;
const documentKey = `spaces/space-1/machines/machine-1/documents/${uuid}.pdf`;
const machine = { isPublic: true, retiredAt: null, space: { status: "ACTIVE", visibility: "PUBLIC" } };
function get(key: string) {
  return GET(new NextRequest(`https://machines.example.test/api/uploads/${key}`), { params: Promise.resolve({ key: key.split("/") }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.photo.mockResolvedValue({ machine });
  mocks.document.mockResolvedValue({ machine, isPublic: true, filename: 'manual".pdf' });
  mocks.member.mockResolvedValue(null);
  mocks.auth.mockResolvedValue(null);
  mocks.download.mockResolvedValue({ body: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
});

describe("machine file visibility", () => {
  it.each(["PUBLIC", "UNLISTED"])("allows anonymous photos and public documents of public machines in active %s spaces", async (visibility) => {
    const visible = { ...machine, space: { ...machine.space, visibility } };
    mocks.photo.mockResolvedValue({ machine: visible });
    mocks.document.mockResolvedValue({ machine: visible, isPublic: true, filename: "manual.pdf" });
    expect(await resolveMachineFile(photoKey, null)).toEqual({ public: true, kind: "photos", filename: null });
    expect(await resolveMachineFile(documentKey, null)).toEqual({ public: true, kind: "documents", filename: "manual.pdf" });
    expect(mocks.member).not.toHaveBeenCalled();
  });

  it.each([
    { ...machine, isPublic: false }, { ...machine, retiredAt: new Date() },
    ...["PENDING", "DECLINED", "SUSPENDED", "ARCHIVED"].map((status) => ({ ...machine, space: { ...machine.space, status } })),
    { ...machine, space: { ...machine.space, visibility: "PRIVATE" } },
  ])("denies anonymous access to photos and documents when their machine is not public (%j)", async (hidden) => {
    mocks.photo.mockResolvedValue({ machine: hidden });
    mocks.document.mockResolvedValue({ machine: hidden, isPublic: true, filename: "manual.pdf" });
    expect(await resolveMachineFile(photoKey, null)).toBeNull();
    expect(await resolveMachineFile(documentKey, null)).toBeNull();
    expect((await get(photoKey)).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("keeps private documents staff-only even when their machine is public", async () => {
    mocks.document.mockResolvedValue({ machine, isPublic: false, filename: "staff.pdf" });
    expect(await resolveMachineFile(documentKey, null)).toBeNull();
    expect((await get(documentKey)).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.member.mockResolvedValue({ role: "VIEWER", status: "ACTIVE" });
    expect(await resolveMachineFile(documentKey, "staff-1")).toEqual({ public: false, kind: "documents", filename: "staff.pdf" });
    expect(mocks.member).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_spaceId: { userId: "staff-1", spaceId: "space-1" } } }));
  });

  it.each([null, { role: "MEMBER", status: "ACTIVE" }, { role: "MEMBER", status: "BLOCKED" }, { role: "VIEWER", status: "PENDING" }])(
    "denies non-staff and inactive members access to private files (%j)", async (member) => {
      mocks.photo.mockResolvedValue({ machine: { ...machine, isPublic: false } });
      mocks.member.mockResolvedValue(member);
      expect(await resolveMachineFile(photoKey, "user-1")).toBeNull();
    },
  );

  it.each(["ACTIVE", "SUSPENDED", "ARCHIVED"])("keeps private files readable by active staff in %s spaces", async (status) => {
    mocks.photo.mockResolvedValue({ machine: { ...machine, isPublic: false, space: { ...machine.space, status } } });
    mocks.member.mockResolvedValue({ role: "MACHINE_MANAGER", status: "ACTIVE" });
    expect(await resolveMachineFile(photoKey, "staff-1")).toMatchObject({ public: false });
  });

  it("denies staff access before space approval", async () => {
    mocks.photo.mockResolvedValue({ machine: { ...machine, space: { ...machine.space, status: "PENDING" } } });
    mocks.member.mockResolvedValue({ role: "MACHINE_MANAGER", status: "ACTIVE" });
    expect(await resolveMachineFile(photoKey, "staff-1")).toBeNull();
  });

  it("rejects invalid, missing or foreign keys and binds lookups to both tenant and machine", async () => {
    expect(await resolveMachineFile("spaces/space-1/../secret", null)).toBeNull();
    expect(mocks.photo).not.toHaveBeenCalled();
    mocks.photo.mockResolvedValue(null);
    mocks.document.mockResolvedValue(null);
    expect(await resolveMachineFile(photoKey.replace("space-1", "foreign-space"), "staff-1")).toBeNull();
    expect(mocks.photo).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
      storageKey: photoKey.replace("space-1", "foreign-space"), spaceId: "foreign-space", machineId: "machine-1",
    } }));
    expect(await resolveMachineFile(documentKey, null)).toBeNull();
    expect(mocks.member).not.toHaveBeenCalled();
  });

  it("serves anonymous photos with safe headers and rechecks access after visibility is revoked", async () => {
    const response = await get(photoKey);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    mocks.photo.mockResolvedValue({ machine: { ...machine, isPublic: false } });
    const revoked = await get(photoKey);
    expect(revoked.status).toBe(404);
    expect(revoked.headers.get("cache-control")).toBe("no-store");
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("downloads public documents as attachments with sanitised filenames", async () => {
    mocks.download.mockResolvedValue({ body: new Uint8Array([1]), contentType: "application/pdf" });
    const response = await get(documentKey);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="manual_.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    mocks.download.mockResolvedValue(null);
    expect((await get(documentKey)).status).toBe(404);
  });
});
