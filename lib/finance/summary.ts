/**
 * Finance maths over ledger rows: income, spending and net per currency, and breakdowns by category,
 * method, machine, technician and supplier. Pure and client-safe; currencies are never added together.
 */
export type LedgerRow = {
  direction: "IN" | "OUT"; category: string; amountMinor: number; currency: string; method: string;
  machine: string | null; technician: string | null; supplier: string;
};

export type Totals = { currency: string; income: number; spending: number; net: number };
export type Breakdown = { label: string; currency: string; income: number; spending: number };

function group(rows: LedgerRow[], key: (row: LedgerRow) => string | null): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const row of rows) {
    const label = key(row);
    if (!label) continue;
    const id = `${label}\u0000${row.currency}`;
    const entry = map.get(id) ?? { label, currency: row.currency, income: 0, spending: 0 };
    if (row.direction === "IN") entry.income += row.amountMinor; else entry.spending += row.amountMinor;
    map.set(id, entry);
  }
  return [...map.values()].sort((a, b) => (b.income + b.spending) - (a.income + a.spending) || a.label.localeCompare(b.label));
}

export function financeSummary(rows: LedgerRow[]) {
  const totals = group(rows, (row) => row.currency).map(({ currency, income, spending }) => ({ currency, income, spending, net: income - spending }));
  return {
    totals: totals.sort((a, b) => a.currency.localeCompare(b.currency)) as Totals[],
    byCategory: group(rows, (row) => row.category),
    byMethod: group(rows, (row) => row.method),
    byMachine: group(rows, (row) => row.machine),
    byTechnician: group(rows, (row) => row.technician),
    bySupplier: group(rows, (row) => row.supplier || null),
  };
}

export type FinanceSummary = ReturnType<typeof financeSummary>;

export const CATEGORY_LABELS: Record<string, string> = {
  JOB_PAYMENT: "Job payments", JOB_REFUND: "Job refunds", REPAIR_PAYOUT: "Repair payouts", MAINTENANCE: "Maintenance",
  PARTS: "Parts", CONSUMABLES: "Consumables", OTHER_INCOME: "Other income", OTHER_EXPENSE: "Other spending", REVERSAL: "Reversals",
};

export const METHOD_LABELS: Record<string, string> = {
  GATEWAY_RAZORPAY: "Razorpay", GATEWAY_STRIPE: "Stripe", CASH: "Cash", BANK_TRANSFER: "Bank transfer", UPI: "UPI", OTHER: "Other",
};
