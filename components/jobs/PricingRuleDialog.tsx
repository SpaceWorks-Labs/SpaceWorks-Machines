"use client";
import { useState } from "react";
import type { z } from "zod";
import type { pricingRuleSchema } from "@/lib/jobs/settingsSchemas";
import { savePricingRuleAction, deletePricingRuleAction } from "@/app/actions/job-settings";
import { isCurrencyCode, parseAmount, toInputValue } from "@/lib/money/currencies";
import { materialRateInput, parseMaterialRate } from "@/lib/jobs/pricingForm";
import { words } from "@/lib/jobs/presentation";
import { Button } from "@/components/ui/button";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { useMachineMutation } from "@/components/machines/useMachineMutation";

type Rule = z.infer<typeof pricingRuleSchema>;
export function PricingRuleDialog({ spaceSlug, currency, types, machines, rule, allowSpaceDefault = true }: {
  spaceSlug: string; currency: string; types: { id: string; name: string }[]; machines: { id: string; name: string; typeId: string }[]; rule?: Rule;
  /** Machine type managers price only their own types and machines, never the space default. */
  allowSpaceDefault?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useMachineMutation();
  const label = rule ? "Edit pricing rule" : "Add pricing rule";
  const inputAmount = (amount: number) => isCurrencyCode(currency) ? toInputValue(amount, currency) : String(amount);
  return <Dialog open={open} onOpenChange={(v) => { if (!mutation.pending) setOpen(v); }}><DialogTrigger asChild><Button variant={rule ? "secondary" : "primary"}>{label}</Button></DialogTrigger>
    <DialogContent size="lg"><DialogHeader title={label} description="Machine prices take precedence over type prices, then the space default. Existing quotes keep their original rates." />
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget); const text = (k: string) => String(f.get(k) ?? "");
        const amount = (k: string) => isCurrencyCode(currency) ? parseAmount(text(k), currency) ?? -1 : -1;
        const scope = text("scope");
        const machine = machines.find((m) => `machine:${m.id}` === scope);
        const typeId = machine ? null : scope.startsWith("type:") ? scope.slice(5) : null;
        const values = { ruleId: rule?.ruleId, typeId, machineId: machine?.id ?? null, audience: text("audience"), mode: text("mode"),
          ...Object.fromEntries(["flatFee", "timeRatePerHour", "setupFee", "minimumCharge"].map((k) => [k, amount(k)])),
          materialRate: isCurrencyCode(currency) ? parseMaterialRate(text("materialRate"), currency) ?? "invalid" : "invalid",
          timeIncrementMinutes: Number(text("timeIncrementMinutes")), depositMode: text("depositMode"),
          depositValue: text("depositMode") === "PERCENT" ? Math.round(Number(text("depositPercent")) * 100) : amount("depositValue"), paymentTiming: text("paymentTiming") || null };
        mutation.run(() => savePricingRuleAction({ spaceSlug, ...values }), "Pricing rule saved", () => setOpen(false));
      }}><DialogBody><fieldset disabled={mutation.pending} className="flex flex-col gap-5">
        {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
        <Field label="Applies to"><Dropdown name="scope" defaultValue={rule?.machineId ? `machine:${rule.machineId}` : rule?.typeId ? `type:${rule.typeId}` : allowSpaceDefault ? "space" : `type:${types[0]?.id ?? ""}`}>{allowSpaceDefault ? <option value="space">Space default</option> : null}{types.map((t) => <option key={t.id} value={`type:${t.id}`}>Type: {t.name}</option>)}{machines.map((m) => <option key={m.id} value={`machine:${m.id}`}>Machine: {m.name}</option>)}</Dropdown></Field>
        <Field label="Audience"><Dropdown name="audience" defaultValue={rule?.audience ?? "MEMBER"}><option value="MEMBER">Members</option><option value="PUBLIC">Public</option></Dropdown></Field>
        <Field label="Pricing mode"><Dropdown name="mode" defaultValue={rule?.mode ?? "FREE"}>{["FREE", "FLAT", "TIME", "MATERIAL", "TIME_AND_MATERIAL"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field>
        {(["flatFee", "timeRatePerHour", "setupFee", "minimumCharge"] as const).map((key) => <Field key={key} label={`${({ flatFee: "Flat fee", timeRatePerHour: "Hourly rate", setupFee: "Setup fee", minimumCharge: "Minimum charge" })[key]} (${currency})`}><Input name={key} inputMode="decimal" defaultValue={inputAmount(rule?.[key] ?? 0)} required /></Field>)}
        <Field label={`Material rate per unit (${currency})`}><Input name="materialRate" inputMode="decimal" defaultValue={rule && isCurrencyCode(currency) ? materialRateInput(rule.materialRate, currency) : "0"} required /></Field>
        <Field label="Billable time increment (minutes)"><Input name="timeIncrementMinutes" type="number" min="1" max="1440" defaultValue={rule?.timeIncrementMinutes ?? 1} required /></Field>
        <Field label="Payment timing"><Dropdown name="paymentTiming" defaultValue={rule?.paymentTiming ?? ""}><option value="">Space default</option>{["UPFRONT", "ON_COMPLETION", "PAY_LATER"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field>
        <Field label="Deposit"><Dropdown name="depositMode" defaultValue={rule?.depositMode ?? "NONE"}>{["NONE", "FIXED", "PERCENT"].map((v) => <option key={v} value={v}>{words(v)}</option>)}</Dropdown></Field>
        <Field label={`Fixed deposit (${currency})`}><Input name="depositValue" inputMode="decimal" defaultValue={inputAmount(rule?.depositMode === "FIXED" ? rule.depositValue : 0)} /></Field>
        <Field label="Percentage deposit"><Input name="depositPercent" type="number" min="0" max="100" step="0.01" defaultValue={rule?.depositMode === "PERCENT" ? rule.depositValue / 100 : 0} /></Field>
      </fieldset></DialogBody><DialogFooter>
        {rule ? <Button type="button" variant="danger" disabled={mutation.pending} onClick={() => mutation.run(() => deletePricingRuleAction({ spaceSlug, ruleId: rule.ruleId }), "Pricing rule deleted", () => setOpen(false))}>Delete pricing rule</Button> : null}
        <Button type="button" variant="secondary" disabled={mutation.pending} onClick={() => setOpen(false)}>Close</Button><Button type="submit" loading={mutation.pending}>Save pricing rule</Button>
      </DialogFooter></form>
    </DialogContent>
  </Dialog>;
}
