import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), profile: vi.fn(), types: vi.fn(), type: vi.fn(), machines: vi.fn(), pools: vi.fn(), pool: vi.fn(),
  ledger: vi.fn(), settings: vi.fn(), actors: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/permissions", () => ({ requireSpaceCapability: mocks.access }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/db", () => ({ prisma: {
  space: { findUniqueOrThrow: mocks.profile }, machineType: { findMany: mocks.types, findFirst: mocks.type },
  machine: { findMany: mocks.machines }, consumablePool: { findMany: mocks.pools, findFirst: mocks.pool },
  consumableAdjustment: { findMany: mocks.ledger }, spaceJobSettings: { findUnique: mocks.settings }, user: { findMany: mocks.actors },
} }));

import { loadMachineSettingsView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__page";
import { loadMachineTypeView } from "@/lib/views/app__dashboard__spaceSlug__machine-settings__types__typeSlug__page";
import { loadConsumablesView } from "@/lib/views/app__dashboard__spaceSlug__consumables__page";
import { loadConsumablePoolView } from "@/lib/views/app__dashboard__spaceSlug__consumables__poolId__page";

const params = () => Promise.resolve({ spaceSlug: "workshop", typeSlug: "laser", poolId: "pool-1" });
const detail = (page?: string | string[]) => loadConsumablePoolView({ params: params(), searchParams: Promise.resolve({ page }) });
const type = {
  id: "type-1", name: "Laser", slug: "laser", icon: "zap", description: "", archivedAt: null,
  consumableUnit: "SHEETS", meteringUnit: "MINUTES", presetKey: "laser_cutter", _count: { machines: 3 },
  specFields: [], requestFields: [], filePolicy: {}, materials: [], colours: [], acceptsJobs: true,
  requiresApproval: true, allocationPolicy: "STAFF_SELECT", maxConcurrentJobs: null, requesterPicksMachine: false, maxOpenJobsPerRequester: null,
};
const decimal = (value: string) => ({ toString: () => value });
const pool = {
  id: "pool-1", machineId: null, typeId: "type-1", material: "Plywood", colour: "Natural", colourHex: "", brand: "", lotCode: "",
  unit: "SHEETS", initialQuantity: decimal("20.001"), remainingQuantity: decimal("1.001"), lowThreshold: decimal("2"), costPerUnit: 12345,
  isPublic: true, isActive: true, machine: null, type: { name: "Laser" }, updatedAt: new Date("2026-01-01"),
};
const entry = { id: "entry-1", kind: "CORRECTION", delta: decimal("-0.001"), balanceAfter: decimal("1.001"),
  actorId: "actor-1", reason: "Counted stock", createdAt: new Date("2026-01-02") };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ space: { id: "space-1", slug: "workshop", name: "Workshop", status: "ACTIVE" }, membership: { role: "MACHINE_MANAGER" }, typeScope: null });
  mocks.profile.mockResolvedValue({ logoUrl: null, currency: "OMR", timezone: "Asia/Kolkata" });
  mocks.types.mockResolvedValue([type]); mocks.type.mockResolvedValue(type); mocks.pools.mockResolvedValue([pool]); mocks.pool.mockResolvedValue(pool);
  mocks.machines.mockResolvedValue([{ id: "machine-1", name: "Laser one", type: { consumableUnit: "SHEETS" } }]);
  mocks.ledger.mockResolvedValue([entry]); mocks.settings.mockResolvedValue(null); mocks.actors.mockResolvedValue([{ id: "actor-1", name: "Operator" }]);
});

describe("machine settings and consumable views", () => {
  it("checks the read capabilities before any domain query", async () => {
    mocks.access.mockRejectedValue(new Error("NO_ACCESS"));
    for (const load of [() => loadMachineSettingsView({ params: params() }), () => loadMachineTypeView({ params: params() }),
      () => loadConsumablesView({ params: params() }), () => detail()]) await expect(load()).rejects.toThrow("NO_ACCESS");
    expect(mocks.access.mock.calls.map((call) => call[1])).toEqual(["machines.view", "machines.view", "consumables.view", "consumables.view"]);
    for (const query of [mocks.types, mocks.type, mocks.pools, mocks.pool, mocks.ledger]) expect(query).not.toHaveBeenCalled();
  });

  it("scopes type lists, machine counts and type slugs to the resolved space", async () => {
    const list = await loadMachineSettingsView({ params: params() });
    expect(list.types[0]).toMatchObject({ archived: false, machineCount: 3, presetKey: "laser_cutter" });
    expect(mocks.types).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1" },
      select: expect.objectContaining({ _count: { select: { machines: { where: { spaceId: "space-1" } } } } }) }));
    await loadMachineTypeView({ params: params() });
    expect(mocks.type).toHaveBeenCalledWith({ where: { spaceId: "space-1", slug: "laser" } });
    mocks.type.mockResolvedValue(null);
    await expect(loadMachineTypeView({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("loads tenant pools and binding choices without crossing Prisma Decimals over the gateway", async () => {
    const view = await loadConsumablesView({ params: params() });
    expect(mocks.pools).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1" } }));
    expect(mocks.types).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", archivedAt: null } }));
    expect(mocks.machines).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", retiredAt: null } }));
    expect(view.pools[0]).toMatchObject({ remainingQuantity: "1.001", lowThreshold: "2", low: true, costPerUnit: 12345 });
    expect(view.machines[0]).toEqual({ id: "machine-1", name: "Laser one", consumableUnit: "SHEETS" });
    expect(view.lowStockAlerts).toBe(true);
  });

  it("returns 404 for a foreign or missing pool before reading ledger or accounts", async () => {
    mocks.pool.mockResolvedValue(null);
    await expect(detail()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", id: "pool-1" } }));
    expect(mocks.ledger).not.toHaveBeenCalled(); expect(mocks.actors).not.toHaveBeenCalled();
  });

  it("paginates a tenant-scoped append-only ledger and resolves only its actors", async () => {
    mocks.ledger.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ ...entry, id: `entry-${i}` })));
    const view = await detail("2");
    expect(mocks.ledger).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", poolId: "pool-1" }, skip: 50, take: 51 }));
    expect(mocks.actors).toHaveBeenCalledWith({ where: { id: { in: ["actor-1"] } }, select: { id: true, name: true } });
    expect(view.hasMore).toBe(true); expect(view.ledger).toHaveLength(50);
    expect(view.ledger[0]).toMatchObject({ delta: "-0.001", balanceAfter: "1.001", actor: "Operator", time: "2026-01-02T00:00:00.000Z" });
    expect(view.ledger[0]).not.toHaveProperty("actorId");
  });

  it.each([undefined, "-1", "1.5", ["2"], "9999999"])("ignores malformed ledger page %s", async (page) => {
    expect((await detail(page)).page).toBe(1);
  });

  it("labels system and removed actors, and honours a disabled alert setting", async () => {
    mocks.ledger.mockResolvedValue([{ ...entry, actorId: null }, { ...entry, id: "entry-2", actorId: "removed" }]);
    mocks.actors.mockResolvedValue([]); mocks.settings.mockResolvedValue({ lowStockAlerts: false });
    const view = await detail();
    expect(view.ledger.map((row) => row.actor)).toEqual(["System", "Former account"]);
    expect(view.lowStockAlerts).toBe(false);
  });

  it.each([
    ["VIEWER", "ACTIVE", false, false, false, false], ["OPERATOR", "ACTIVE", false, false, true, false],
    ["TYPE_MANAGER", "ACTIVE", false, true, false, false], ["MACHINE_MANAGER", "ACTIVE", true, true, true, true],
    ["MACHINE_MANAGER", "SUSPENDED", false, false, false, false], ["MACHINE_MANAGER", "ARCHIVED", false, false, false, false],
  ])("gates settings, type edits, stock and alerts for %s in %s", async (role, status, settings, typeEdit, stock, alerts) => {
    mocks.access.mockResolvedValue({ space: { id: "space-1", slug: "workshop", status }, membership: { role }, typeScope: role === "TYPE_MANAGER" ? ["type-1"] : null });
    expect((await loadMachineSettingsView({ params: params() })).canManage).toBe(settings);
    expect((await loadMachineTypeView({ params: params() })).canManage).toBe(typeEdit);
    for (const view of [await loadConsumablesView({ params: params() }), await detail()]) {
      expect(view.canManage).toBe(stock); expect(view.canConfigureAlerts).toBe(alerts);
    }
  });

  it("shows a machine type manager only their types, and the rest as not found", async () => {
    mocks.access.mockResolvedValue({ space: { id: "space-1", slug: "workshop", status: "ACTIVE" }, membership: { role: "TYPE_MANAGER" }, typeScope: ["type-2"] });
    await loadMachineSettingsView({ params: params() });
    expect(mocks.types).toHaveBeenCalledWith(expect.objectContaining({ where: { spaceId: "space-1", id: { in: ["type-2"] } } }));
    await expect(loadMachineTypeView({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
