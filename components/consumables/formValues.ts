import type { MeteringUnit } from "@prisma/client";

export type BindingOption = { id: string; name: string; consumableUnit: MeteringUnit | null };
export type PoolChoices = { types: BindingOption[]; machines: BindingOption[] };
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** Stock strings stay decimal strings all the way to the action. Money is parsed there in space currency. */
export function readPoolDetails(data: FormData) {
  return { material: text(data, "material"), colour: text(data, "colour"), colourHex: text(data, "colourHex"),
    brand: text(data, "brand"), lotCode: text(data, "lotCode"), lowThreshold: text(data, "lowThreshold") || null,
    costPerUnit: text(data, "costPerUnit"), isPublic: data.has("isPublic") };
}

export function readPoolCreation(data: FormData) {
  const scope = text(data, "binding");
  const binding = scope.startsWith("machine:") ? { kind: "machine", machineId: scope.slice(8) }
    : scope.startsWith("type:") ? { kind: "type", typeId: scope.slice(5) } : { kind: "shared" };
  return { ...readPoolDetails(data), unit: text(data, "unit"), initialQuantity: text(data, "initialQuantity"), binding };
}

export function poolFieldError(errors: Record<string, string[]>, key: string) {
  return Object.entries(errors).filter(([path]) => path === key || path.startsWith(`${key}.`)).flatMap(([, messages]) => messages).join(" ");
}
