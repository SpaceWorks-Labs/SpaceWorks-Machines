"use client";

import { Field, Input } from "@/components/ui/field";
import { CheckboxField } from "@/components/ui/choice";
import { isCurrencyCode, toInputValue } from "@/lib/money/currencies";
import type { PoolRow } from "@/lib/machines/queries";
import { poolFieldError } from "./formValues";

export function PoolDetailsFields({ pool, currency, errors }: { pool?: PoolRow; currency: string; errors: Record<string, string[]> }) {
  const error = (key: string) => poolFieldError(errors, key);
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Material" error={error("material")}><Input name="material" required maxLength={60} defaultValue={pool?.material ?? ""} /></Field>
    <Field label="Colour" optional error={error("colour")}><Input name="colour" maxLength={40} defaultValue={pool?.colour ?? ""} /></Field>
    <Field label="Colour swatch (hex)" optional helperText="For example #29A398. Leave empty for no swatch." error={error("colourHex")}>
      <Input name="colourHex" maxLength={7} defaultValue={pool?.colourHex ?? ""} placeholder="#29A398" />
    </Field>
    <Field label="Brand" optional error={error("brand")}><Input name="brand" maxLength={60} defaultValue={pool?.brand ?? ""} /></Field>
    <Field label="Lot" optional error={error("lotCode")}><Input name="lotCode" maxLength={60} defaultValue={pool?.lotCode ?? ""} /></Field>
    <Field label="Low-stock threshold" optional helperText="In the pool's unit, up to three decimals. Leave empty for no threshold." error={error("lowThreshold")}>
      <Input name="lowThreshold" inputMode="decimal" defaultValue={pool?.lowThreshold ?? ""} />
    </Field>
    <Field label={`Cost per unit (${currency})`} optional error={error("costPerUnit")}>
      <Input name="costPerUnit" inputMode="decimal" defaultValue={pool?.costPerUnit != null && isCurrencyCode(currency) ? toInputValue(pool.costPerUnit, currency) : ""} />
    </Field>
    <div className="flex flex-col justify-center gap-2"><CheckboxField label="Public" name="isPublic" defaultChecked={pool?.isPublic ?? true} description="Make this material available in the public catalogue." />
      {error("isPublic") ? <p role="alert" className="text-caption text-danger-fg">{error("isPublic")}</p> : null}</div>
  </div>;
}
