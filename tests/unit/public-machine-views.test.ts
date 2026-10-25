import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  space: vi.fn(), machines: vi.fn(), machine: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/jobs/intake", () => ({ canRequestMachine: async () => false }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/db", () => ({ prisma: {
  space: { findUnique: mocks.space }, machine: { findMany: mocks.machines, findFirst: mocks.machine },
} }));

import { loadPublicMachinesView } from "@/lib/views/app__s__spaceSlug__machines__page";
import { loadPublicMachineView } from "@/lib/views/app__s__spaceSlug__machines__machineSlug__page";
import MachinesPage, { generateMetadata as catalogueMetadata } from "@/app/s/[spaceSlug]/machines/page";
import MachinePage, { generateMetadata as machineMetadata } from "@/app/s/[spaceSlug]/machines/[machineSlug]/page";

const space = { id: "space-1", slug: "workshop", name: "Workshop", description: "A workshop", status: "ACTIVE", visibility: "PUBLIC" };
const photos = [{ storageKey: "spaces/space-1/machines/laser/photos/cover.webp", alt: "Laser cover" }];
const documents = [{ id: "manual", title: "Operating manual", kind: "MANUAL", storageKey: "spaces/space-1/machines/laser/documents/manual.pdf" }];
const fields = [
  { key: "power", label: "Power", kind: "number", unit: "W", public: true },
  { key: "enclosed", label: "Enclosure", kind: "boolean", public: true },
  { key: "internal", label: "Internal specification", kind: "text", public: false },
  { key: "default", label: "Unmarked specification", kind: "text" },
];
const row = { slug: "laser", name: "Laser one", description: "Public machine description", status: "IDLE",
  specs: { power: 0, enclosed: false, internal: "Private spec value", default: "Unmarked spec value", removed: "Removed spec value" },
  type: { slug: "laser-cutter", name: "Laser cutter", icon: "zap", specFields: fields }, photos, documents,
  notes: "Staff notes", statusNote: "Staff status note", location: "Internal location", serialNumber: "Private serial", purchaseCost: 123, meterMinutes: 999,
};
const props = () => ({ params: Promise.resolve({ spaceSlug: "workshop", machineSlug: "laser" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.space.mockResolvedValue(space);
  mocks.machines.mockResolvedValue([row]);
  mocks.machine.mockResolvedValue(row);
});

describe("public machine pages", () => {
  it.each([null, { ...space, status: "PENDING" }, { ...space, status: "SUSPENDED" }, { ...space, status: "ARCHIVED" }, { ...space, visibility: "PRIVATE" }])(
    "returns 404 before machine queries when the space is unavailable (%j)", async (unavailable) => {
      mocks.space.mockResolvedValue(unavailable);
      await expect(loadPublicMachinesView(props())).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(loadPublicMachineView(props())).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.machines).not.toHaveBeenCalled();
      expect(mocks.machine).not.toHaveBeenCalled();
    },
  );

  it("scopes both routes and their files to the resolved tenant and selects only public, non-retired machines", async () => {
    await loadPublicMachinesView(props());
    await loadPublicMachineView(props());
    expect(mocks.space).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "workshop" } }));
    expect(mocks.machines).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", isPublic: true, retiredAt: null } }));
    expect(mocks.machine).toHaveBeenCalledWith(expect.objectContaining({
      where: { spaceId: "space-1", slug: "laser", isPublic: true, retiredAt: null },
      select: expect.objectContaining({
        photos: expect.objectContaining({ where: { spaceId: "space-1" } }),
        documents: expect.objectContaining({ where: { spaceId: "space-1", isPublic: true } }),
      }),
    }));
    for (const query of [mocks.machines.mock.calls[0][0], mocks.machine.mock.calls[0][0]]) {
      for (const key of ["notes", "statusNote", "location", "serialNumber", "purchaseCost", "meterMinutes", "meterJobs"]) {
        expect(query.select).not.toHaveProperty(key);
      }
    }
  });

  it("returns the same 404 for unknown, foreign, private and retired machine lookups", async () => {
    mocks.machine.mockResolvedValue(null);
    await expect(loadPublicMachineView(props())).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(machineMetadata(props())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("groups machines by type, projects public specs only and retains false and zero", async () => {
    mocks.machines.mockResolvedValue([row, { ...row, slug: "laser-two" }, { ...row, slug: "printer", type: { ...row.type, slug: "printer", name: "Printer" } }]);
    const list = await loadPublicMachinesView(props());
    expect(list.groups.map((group) => [group.type.name, group.machines.length])).toEqual([["Laser cutter", 2], ["Printer", 1]]);
    const detail = await loadPublicMachineView(props());
    expect(detail.machine.specs).toEqual([{ key: "power", label: "Power", value: "0 W" }, { key: "enclosed", label: "Enclosure", value: "No" }]);
    expect(detail.photos).toEqual([{ url: `/api/uploads/${photos[0].storageKey}`, alt: "Laser cover" }]);
    expect(detail.documents[0]).toEqual({ id: "manual", title: "Operating manual", kind: "MANUAL", url: `/api/uploads/${documents[0].storageKey}` });
    const payload = JSON.stringify([list, detail]);
    for (const secret of ["Staff notes", "Staff status note", "Internal location", "Private serial", "Private spec value", "Unmarked spec value", "Removed spec value", "specFields", "storageKey"]) {
      expect(payload).not.toContain(secret);
    }
  });

  it.each(["PUBLIC", "UNLISTED"])("uses public fields in metadata and permits indexing only for PUBLIC spaces (%s)", async (visibility) => {
    mocks.space.mockResolvedValue({ ...space, visibility });
    expect(await catalogueMetadata(props())).toEqual({ title: "Machines", description: "Explore machines, specifications and live status at Workshop.", robots: { index: visibility === "PUBLIC", follow: visibility === "PUBLIC" } });
    expect(await machineMetadata(props())).toEqual({ title: "Laser one", description: row.description, robots: { index: visibility === "PUBLIC", follow: visibility === "PUBLIC" } });
    mocks.machine.mockResolvedValue({ ...row, description: "" });
    expect((await machineMetadata(props())).description).toContain("Laser one at Workshop");
    mocks.machine.mockResolvedValue({ ...row, description: "a".repeat(200) });
    expect((await machineMetadata(props())).description).toHaveLength(160);
  });

  it("renders the public catalogue, status words, gallery, specs and documents without staff details or future actions", async () => {
    const list = renderToStaticMarkup(await MachinesPage(props()));
    const detail = renderToStaticMarkup(await MachinePage(props()));
    expect(list).toContain('href="/s/workshop/machines/laser"');
    expect(list).toContain("Laser cutter");
    for (const html of [list, detail]) {
      expect(html).toContain("Idle");
      expect(html).toContain("0 W");
      expect(html).toContain("Laser cover");
      for (const hidden of ["Request a job", "Report a problem", "Internal location", "Staff notes", "Private serial", "Private spec value"]) expect(html).not.toContain(hidden);
    }
    expect(detail).toContain("Operating manual");
    expect(detail).toContain(`/api/uploads/${documents[0].storageKey}`);
    expect(detail).toContain("Photos");
  });

  it("renders clear empty states with no photos, specifications, documents or machines", async () => {
    mocks.machines.mockResolvedValue([]);
    expect(renderToStaticMarkup(await MachinesPage(props()))).toContain("No public machines yet");
    mocks.machine.mockResolvedValue({ ...row, specs: {}, photos: [], documents: [] });
    const html = renderToStaticMarkup(await MachinePage(props()));
    expect(html).toContain("No public specifications listed.");
    expect(html).toContain("No public documents listed.");
    expect(html).not.toContain('<h2 id="photos"');
  });
});
