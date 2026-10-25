import type { FieldDefinition } from "@/lib/machines/fields";
import type { JobCommand } from "@/lib/jobs/commands";
import { isCurrencyCode, parseAmount } from "@/lib/money/currencies";

export function requestValues(form: FormData, fields: readonly FieldDefinition[]) {
  const text = (key: string) => String(form.get(key) ?? "");
  return { title: text("title"), description: text("description"), sourceLink: text("sourceLink"), quantity: Number(text("quantity")),
    requesterEmail: text("requesterEmail") || undefined,
    requestData: Object.fromEntries(fields.map((f) => {
      const key = `request.${f.key}`;
      return [f.key, f.kind === "multiselect" ? form.getAll(key).map(String) : f.kind === "dimensions"
        ? { x: text(`${key}.x`), y: text(`${key}.y`), z: text(`${key}.z`) } : text(key)];
    })) };
}
export function commandValues(kind: JobCommand["kind"], form: FormData, currency: string) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const value: Record<string, unknown> = { kind };
  for (const key of ["reason", "note", "body", "machineId", "poolId", "estimatedQuantity", "actualQuantity", "plannedQuantity", "paymentOverrideReason"]) {
    if (text(key)) value[key] = text(key);
  }
  for (const key of ["estimatedMinutes", "actualMinutes", "percent", "priority"]) if (text(key)) value[key] = Number(text(key));
  if (kind === "reassign") value.machineId = text("machineId") || null;
  if (kind === "note") value.internal = form.get("internal") === "on";
  if (text("priceOverride")) value.priceOverride = isCurrencyCode(currency) ? parseAmount(text("priceOverride"), currency) ?? -1 : -1;
  return value;
}
