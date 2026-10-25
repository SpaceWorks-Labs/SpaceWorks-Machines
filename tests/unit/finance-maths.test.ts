import { describe, expect, it } from "vitest";
import { financePeriod, localDate, zonedStart } from "@/lib/finance/period";
import { financeSummary, type LedgerRow } from "@/lib/finance/summary";
import { buildXlsx } from "@/lib/xlsx";

const row = (overrides: Partial<LedgerRow>): LedgerRow => ({ direction: "IN", category: "JOB_PAYMENT", amountMinor: 100, currency: "INR", method: "UPI",
  machine: null, technician: null, supplier: "", ...overrides });

describe("finance periods in the space's time zone", () => {
  it("starts days at local midnight, across offsets", () => {
    expect(zonedStart("2026-04-01", "Asia/Kolkata").toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(zonedStart("2026-07-01", "Europe/London").toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(zonedStart("2026-01-15", "UTC").toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(localDate(new Date("2026-03-31T19:00:00Z"), "Asia/Kolkata")).toBe("2026-04-01");
  });

  it("runs the financial year from 1 April to 31 March", () => {
    const fy = financePeriod("year", "2027-02-10", "Asia/Kolkata");
    expect(fy.label).toBe("FY 2026-27");
    expect(fy.from.toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(fy.to.toISOString()).toBe("2027-03-31T18:30:00.000Z");
    expect(financePeriod("year", "2026-04-01", "UTC").label).toBe("FY 2026-27");
    expect(financePeriod("year", "2026-03-31", "UTC").label).toBe("FY 2025-26");
    expect(fy.previous).toBe("2025-04-01");
    expect(fy.next).toBe("2027-04-01");
  });

  it("weeks start on Monday, months on the 1st, and bad anchors fall back to today", () => {
    const week = financePeriod("week", "2026-10-24", "UTC");
    expect(week.anchor).toBe("2026-10-19");
    expect(week.to.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    const month = financePeriod("month", "2026-12-31", "UTC");
    expect([month.label, month.previous, month.next]).toEqual(["December 2026", "2026-11-30", "2027-01-01"]);
    expect(financePeriod("day", "nonsense", "UTC", new Date("2026-05-05T10:00:00Z")).label).toBe("2026-05-05");
  });
});

describe("finance summary", () => {
  it("totals income, spending and net per currency without mixing them", () => {
    const summary = financeSummary([row({ amountMinor: 5000 }), row({ direction: "OUT", category: "REPAIR_PAYOUT", amountMinor: 1200, technician: "Ravi", machine: "Laser" }),
      row({ currency: "USD", amountMinor: 700 }), row({ direction: "OUT", category: "PARTS", amountMinor: 300, supplier: "Robu", machine: "Laser" })]);
    expect(summary.totals).toEqual([{ currency: "INR", income: 5000, spending: 1500, net: 3500 }, { currency: "USD", income: 700, spending: 0, net: 700 }]);
    expect(summary.byMachine).toEqual([{ label: "Laser", currency: "INR", income: 0, spending: 1500 }]);
    expect(summary.byTechnician.map((r) => r.label)).toEqual(["Ravi"]);
    expect(summary.bySupplier.map((r) => r.label)).toEqual(["Robu"]);
    expect(summary.byCategory.find((r) => r.label === "JOB_PAYMENT")).toMatchObject({ income: 5000 });
  });
});

/** Read back the stored zip entries (method 0) of the workbook. */
function entries(buffer: Buffer) {
  const files = new Map<string, string>();
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    const size = buffer.readUInt32LE(offset + 18), nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    files.set(name, buffer.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size).toString("utf8"));
    offset += 30 + nameLength + size;
  }
  return files;
}

describe("Excel export", () => {
  it("writes a valid stored zip with the sheet's cells, numbers as numbers and formulas as text", () => {
    const buffer = buildXlsx("Finance", [["Date", "Amount"], ["2026-10-24", 12.5], ["=HYPERLINK(\"x\")", null]]);
    expect(buffer.readUInt32LE(buffer.length - 22)).toBe(0x06054b50);
    const files = entries(buffer);
    expect([...files.keys()]).toContain("xl/worksheets/sheet1.xml");
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain("&quot;x&quot;");
    expect(sheet).not.toContain("<f>");
  });
});
