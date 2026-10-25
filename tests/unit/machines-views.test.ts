import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), profile: vi.fn(), types: vi.fn(), machines: vi.fn(), machine: vi.fn(), counts: vi.fn(), retired: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/permissions", () => ({ requireSpaceCapability: mocks.access }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/db", () => ({ prisma: {
  space: { findUniqueOrThrow: mocks.profile }, machineType: { findMany: mocks.types },
  machine: { findMany: mocks.machines, findFirst: mocks.machine, groupBy: mocks.counts, count: mocks.retired },
} }));

import { loadMachinesView } from "@/lib/views/app__dashboard__spaceSlug__machines__page";
import { loadMachineView } from "@/lib/views/app__dashboard__spaceSlug__machines__machineSlug__page";

const fields = [
  { key: "power", label: "Power", kind: "number", required: true },
  { key: "enclosed", label: "Enclosure", kind: "boolean", required: true },
] as const;
const type = { id: "type-1", name: "Laser", icon: "zap", archivedAt: null, specFields: fields, materials: [], colours: [] };
const params = () => Promise.resolve({ spaceSlug: "workshop", machineSlug: "laser-one" });
function list(filters: { type?: string | string[]; status?: string | string[] } = {}) {
  return loadMachinesView({ params: params(), searchParams: Promise.resolve(filters) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ space: { id: "space-1", slug: "workshop", name: "Workshop", status: "ACTIVE" }, membership: { role: "MACHINE_MANAGER" }, typeScope: null });
  mocks.profile.mockResolvedValue({ logoUrl: null, currency: "OMR" });
  mocks.types.mockResolvedValue([type, { ...type, id: "archived-type", archivedAt: new Date() }]);
  mocks.machines.mockResolvedValue([]);
  mocks.counts.mockResolvedValue([{ status: "IDLE", _count: 2 }]);
  mocks.retired.mockResolvedValue(1);
  mocks.machine.mockResolvedValue({
    id: "machine-1", slug: "laser-one", name: "Laser one", status: "IDLE", statusNote: "", retiredAt: null,
    isPublic: true, acceptsJobs: true, type, specs: { power: 0, enclosed: false, removed_secret: "Hidden old spec" },
    manufacturer: "", model: "", serialNumber: "", location: "", description: "", notes: "Staff notes", firmwareVersion: "",
    acquiredOn: new Date("2026-01-04T00:00:00Z"), purchaseCost: 12345,
    photos: [{ id: "photo-1", storageKey: "spaces/space-1/machines/machine-1/photos/photo.webp", alt: "Laser" }],
    documents: [{ id: "document-1", storageKey: "spaces/space-1/machines/machine-1/documents/manual.pdf", title: "Manual", kind: "MANUAL", isPublic: false, filename: "manual.pdf", sizeBytes: 100 }],
  });
});

describe("staff machine views", () => {
  it("gates both routes before querying machines", async () => {
    mocks.access.mockRejectedValue(new Error("NO_ACCESS"));
    await expect(list()).rejects.toThrow("NO_ACCESS");
    await expect(loadMachineView({ params: params() })).rejects.toThrow("NO_ACCESS");
    expect(mocks.access).toHaveBeenCalledWith("workshop", "machines.view");
    expect(mocks.machines).not.toHaveBeenCalled();
    expect(mocks.machine).not.toHaveBeenCalled();
  });

  it("scopes the list, type options and live status counts to the resolved space", async () => {
    const view = await list({ type: "type-1", status: "IDLE" });
    expect(mocks.machines).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", typeId: "type-1", status: "IDLE", retiredAt: null } }));
    expect(mocks.types).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1" } }));
    expect(mocks.counts).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", retiredAt: null } }));
    expect(view.totals).toMatchObject({ total: 2, retired: 1, counts: { IDLE: 2, RUNNING: 0 } });
    expect(view.types[1].archived).toBe(true);
  });

  it("reads retired machines separately and ignores foreign type IDs and malformed filters", async () => {
    await list({ type: "foreign-type", status: "RETIRED" });
    expect(mocks.machines).toHaveBeenLastCalledWith(expect.objectContaining({ where: { spaceId: "space-1", retiredAt: { not: null } } }));
    const view = await list({ type: ["type-1"], status: ["IDLE"] });
    expect(view.typeId).toBe("");
    expect(view.status).toBe("");
    expect(mocks.machines).toHaveBeenLastCalledWith(expect.objectContaining({ where: { spaceId: "space-1", retiredAt: null } }));
  });

  it("returns 404 for unknown or foreign machine slugs using a tenant-scoped lookup", async () => {
    mocks.machine.mockResolvedValue(null);
    await expect(loadMachineView({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.machine).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", slug: "laser-one" } }));
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("hides removed spec keys, keeps false and zero, formats cost by currency, and uses private file URLs", async () => {
    const view = await loadMachineView({ params: params() });
    expect(view.details.specs).toEqual({ power: 0, enclosed: false });
    expect(view.missingSpecs).toEqual([]);
    expect(view.details.purchaseCost).toBe("12.345");
    expect(view.details.acquiredOn).toBe("2026-01-04");
    expect(view.photos[0].url).toBe("/api/uploads/spaces/space-1/machines/machine-1/photos/photo.webp");
    expect(view.documents[0].url).toBe("/api/uploads/spaces/space-1/machines/machine-1/documents/manual.pdf");
  });

  it("reports missing required specs as warnings without rejecting the view", async () => {
    const row = await mocks.machine();
    mocks.machine.mockResolvedValue({ ...row, specs: {} });
    const view = await loadMachineView({ params: params() });
    expect(view.missingSpecs).toEqual(["power", "enclosed"]);
  });

  it.each([
    ["VIEWER", "ACTIVE", false, false], ["OPERATOR", "ACTIVE", false, true], ["TECHNICIAN", "ACTIVE", false, true],
    ["MACHINE_MANAGER", "ACTIVE", true, true], ["MACHINE_MANAGER", "SUSPENDED", false, false], ["MACHINE_MANAGER", "ARCHIVED", false, false],
  ])("gates controls for %s in %s", async (role, status, manage, changeStatus) => {
    mocks.access.mockResolvedValue({ space: { id: "space-1", slug: "workshop", name: "Workshop", status }, membership: { role }, typeScope: null });
    expect((await list()).canManage).toBe(manage);
    const view = await loadMachineView({ params: params() });
    expect(view.canManage).toBe(manage);
    expect(view.canChangeStatus).toBe(changeStatus);
  });
});
