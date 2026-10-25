import { describe, expect, it } from "vitest";
import { consumablesReport, jobsReport, maintenanceReport, revenueReport, utilisationReport } from "@/lib/reports/compute";
import { reportRange } from "@/lib/reports/range";

const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-02T00:00:00Z");

describe("report maths", () => {
  it("counts jobs, failure rate and turnaround", () => {
    const at = (h: number) => new Date(from.getTime() + h * 3_600_000);
    const report = jobsReport([
      { status: "COMPLETED", typeName: "FDM", machineName: "Mk4", submittedAt: at(0), completedAt: at(2) },
      { status: "COLLECTED", typeName: "FDM", machineName: "Mk4", submittedAt: at(0), completedAt: at(4) },
      { status: "FAILED", typeName: "Laser", machineName: null, submittedAt: at(1), completedAt: null },
      { status: "SUBMITTED", typeName: "Laser", machineName: null, submittedAt: at(1), completedAt: null },
    ]);
    expect(report).toMatchObject({ total: 4, turnaroundMinutes: 180 });
    expect(report.failureRate).toBeCloseTo(1 / 3);
    expect(report.byType).toEqual([{ label: "FDM", total: 2 }, { label: "Laser", total: 2 }]);
    expect(report.byMachine).toContainEqual({ label: "Unassigned", total: 2 });
    expect(jobsReport([]).failureRate).toBeNull();
  });
  it("reports utilisation per machine", () => {
    const rows = utilisationReport([{ id: "m1", name: "Mk4" }, { id: "m2", name: "Laser" }], [{ machineId: "m1", minutes: 90 }, { machineId: "m1", minutes: 30 }],
      [{ machineId: "m2", startedAt: from, endedAt: new Date(from.getTime() + 6 * 3_600_000), faultId: null }], [], from, to);
    expect(rows[0]).toMatchObject({ name: "Mk4", hoursRun: 2, runs: 2, availability: 1 });
    expect(rows[1]).toMatchObject({ name: "Laser", hoursRun: 0, downtimeMinutes: 360, availability: 0.75 });
  });
  it("sums consumables used (reservations net of reconcile and release, plus manual) without float noise", () => {
    const rows = consumablesReport([
      { poolLabel: "PLA Black", material: "PLA", unit: "GRAMS", kind: "RESERVE", delta: -10.1, costPerUnit: 200 },
      { poolLabel: "PLA Black", material: "PLA", unit: "GRAMS", kind: "RECONCILE", delta: 1.975, costPerUnit: 200 },
      { poolLabel: "PLA Black", material: "PLA", unit: "GRAMS", kind: "MANUAL", delta: -0.2, costPerUnit: 200 },
      { poolLabel: "PLA Black", material: "PLA", unit: "GRAMS", kind: "RESTOCK", delta: 500, costPerUnit: 200 },
    ]);
    expect(rows).toEqual([{ label: "PLA Black", material: "PLA", unit: "GRAMS", used: 8.325, cost: 1665 }]);
  });
  it("never adds money across currencies", () => {
    const report = revenueReport([
      { currency: "INR", status: "PAID", method: "CASH", typeName: "FDM", machineName: "Mk4", amount: 10000 },
      { currency: "USD", status: "PAID", method: "STRIPE", typeName: "FDM", machineName: "Mk4", amount: 500 },
      { currency: "INR", status: "PENDING", method: null, typeName: "FDM", machineName: null, amount: 2500 },
      { currency: "INR", status: "WAIVED", method: null, typeName: "FDM", machineName: null, amount: 100 },
    ], [{ currency: "INR", amount: 1000 }]);
    expect(report.currencies).toEqual([{ currency: "INR", paid: 10000, pending: 2500, waived: 100, refunded: 1000 }, { currency: "USD", paid: 500, pending: 0, waived: 0, refunded: 0 }]);
    expect(report.byType).toEqual([{ label: "FDM", currency: "INR", amount: 10000 }, { label: "FDM", currency: "USD", amount: 500 }]);
  });
  it("derives fleet MTBF from total up time and MTTR from fault downtime", () => {
    const utilisation = utilisationReport([{ id: "a", name: "A" }, { id: "b", name: "B" }], [],
      [{ machineId: "a", startedAt: from, endedAt: new Date(from.getTime() + 4 * 3_600_000), faultId: "f" }], [{ machineId: "a", createdAt: from }], from, to);
    const report = maintenanceReport(utilisation, [{ machineId: "a", cost: 1200 }, { machineId: "b", cost: null }], 1,
      [{ machineId: "a", startedAt: from, endedAt: new Date(from.getTime() + 4 * 3_600_000), faultId: "f" }], [{ machineId: "a", createdAt: from }], from, to);
    expect(report).toEqual({ logs: 2, cost: 1200, overdue: 1, faults: 1, mtbfMinutes: (48 - 4) * 60, mttrMinutes: 240 });
  });
  it("parses report ranges with sensible defaults and limits", () => {
    const now = new Date("2026-10-24T15:00:00Z");
    expect(reportRange(null, null, now)).toMatchObject({ fromInput: "2026-09-25", toInput: "2026-10-24" });
    expect(reportRange("2026-10-10", "2026-10-01", now).fromInput).toBe("2026-09-02");
    expect(reportRange("2020-01-01", "2026-10-24", now).fromInput).toBe("2024-10-23");
    expect(reportRange("2026-10-01", "2026-10-01", now).to).toEqual(new Date("2026-10-02T00:00:00Z"));
  });
});
