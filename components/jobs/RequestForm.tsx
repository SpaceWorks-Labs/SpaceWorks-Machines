"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { intakeOptions } from "@/lib/jobs/intake";
import { calculatePrice, resolvePricingRule } from "@/lib/pricing";
import { money, words } from "@/lib/jobs/presentation";
import { describeFilePolicy } from "@/lib/machines/filePolicy";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, Textarea, Dropdown } from "@/components/ui/field";
import { useMachineMutation } from "@/components/machines/useMachineMutation";
import { requestValues } from "./formValues";
import { RequestFields } from "./RequestFields";

export type Intake = Awaited<ReturnType<typeof intakeOptions>>;
export function RequestForm({ space, intake, initial = {}, onBehalf = false }: {
  space: { id: string; slug: string; currency: string }; intake: Intake; initial?: { type?: string; machine?: string }; onBehalf?: boolean;
}) {
  const [typeId, setTypeId] = useState(intake.types.find((t) => t.id === initial.type)?.id ?? intake.types[0]?.id ?? "");
  const [machineId, setMachineId] = useState(initial.machine ?? "");
  const type = intake.types.find((t) => t.id === typeId);
  const machine = intake.machines.find((m) => m.id === machineId && m.typeId === typeId);
  const mutation = useMachineMutation();
  const router = useRouter();
  let estimate = "Free";
  let priceError = "";
  try {
    const rule = resolvePricingRule(intake.rules, { spaceId: space.id, typeId, machineId: type?.requesterPicksMachine || onBehalf ? machine?.id : undefined, audience: intake.audience, ...intake.settings });
    estimate = rule && !["FREE", "FLAT"].includes(rule.mode) ? `Estimated after review · ${words(rule.mode)} pricing` :
      calculatePrice(rule, intake.settings).total ? `Estimated price: ${money(calculatePrice(rule, intake.settings).total, space.currency)}` : "Free";
    if (onBehalf) estimate += " · Final price depends on the requester's membership";
  } catch (error) { priceError = error instanceof Error ? error.message : "Pricing is unavailable."; }
  if (intake.unavailable) return <Callout>{intake.unavailable}</Callout>;
  if (!type) return <Callout>No machine types are accepting requests.</Callout>;
  return <form className="flex max-w-[760px] flex-col gap-5" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = new FormData();
    body.set("values", JSON.stringify({ ...requestValues(form, type.requestFields), typeId, machineId: (type.requesterPicksMachine || onBehalf) ? machine?.id : undefined }));
    for (const file of form.getAll("files")) if (file instanceof File && file.size) body.append("files", file);
    mutation.run(async () => {
      const response = await fetch(`/api/spaces/${space.slug}/jobs/files?typeId=${type.id}`, { method: "POST", body });
      return response.json();
    }, "Job requested", (data: { number: number } | undefined) => {
      if (data) router.push(onBehalf ? `/dashboard/${space.slug}/jobs/${data.number}` : `/s/${space.slug}/jobs/${data.number}`);
    });
  }}>
    <fieldset disabled={mutation.pending} className="flex flex-col gap-5">
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      {onBehalf ? <Field label="Requester email"><Input name="requesterEmail" type="email" required maxLength={254} /></Field> : null}
      <Field label="Machine type"><Dropdown value={type.id} onChange={(e) => { setTypeId(e.target.value); setMachineId(""); }}>{intake.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Dropdown></Field>
      {(type.requesterPicksMachine || onBehalf) ? <Field label="Machine" optional><Dropdown value={machine?.id ?? ""} onChange={(e) => setMachineId(e.target.value)}><option value="">Let staff allocate a machine</option>
        {intake.machines.filter((m) => m.typeId === type.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Dropdown></Field> : null}
      <Field label="Title"><Input name="title" required maxLength={200} /></Field>
      <Field label="Description" optional><Textarea name="description" maxLength={10000} /></Field>
      <Field label="Source link" optional><Input name="sourceLink" type="url" maxLength={2048} /></Field>
      <div key={type.id} className="flex flex-col gap-5"><RequestFields fields={type.requestFields} context={type} /></div>
      <Field label="Quantity"><Input name="quantity" type="number" min="1" step="1" defaultValue="1" required /></Field>
      {type.filePolicy.maxFiles > 0 && type.filePolicy.extensions.length > 0 ? <Field label="Job files" helperText={describeFilePolicy(type.filePolicy)} optional={!type.filePolicy.required}>
        <Input name="files" type="file" multiple accept={type.filePolicy.extensions.map((e) => `.${e}`).join(",")} required={type.filePolicy.required} />
      </Field> : null}
      <Callout tone={priceError ? "warning" : "info"}>{priceError || estimate}</Callout>
      <div><Button type="submit" variant={onBehalf ? "primary" : "accent"} loading={mutation.pending} disabled={Boolean(priceError)}>Request job</Button></div>
    </fieldset>
  </form>;
}
