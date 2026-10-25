"use client";

import { updateMachineAction } from "@/app/actions/machines";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { MachineFormFields } from "./MachineFormFields";
import { readMachineForm } from "./formValues";
import { useMachineMutation } from "./useMachineMutation";
import type { MachineDetailsInput, MachineTypeOption } from "./types";

export function MachineDetailsForm({ spaceSlug, machineId, type, currency, values, money = true }: {
  money?: boolean;
  spaceSlug: string; machineId: string; type: MachineTypeOption; currency: string; values: MachineDetailsInput;
}) {
  const mutation = useMachineMutation();
  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => {
      event.preventDefault();
      const details = readMachineForm(new FormData(event.currentTarget), type.specFields);
      mutation.run(() => updateMachineAction({ spaceSlug, machineId, ...details }), "Machine saved");
    }}>
      {mutation.error ? <Callout tone="danger" role="alert">{mutation.error}</Callout> : null}
      <fieldset disabled={mutation.pending}>
        <MachineFormFields type={type} currency={currency} values={values} errors={mutation.fieldErrors} money={money} />
      </fieldset>
      <div><Button type="submit" variant="primary" loading={mutation.pending}>Save machine</Button></div>
    </form>
  );
}
