import { DetailList, SectionHeading } from "@/components/ui/display";
import { specRows } from "@/lib/machines/fields";
import type { MachineDetailsInput, MachineTypeOption } from "./types";

export function MachineDetailsReadOnly({ values, type, currency, money = true }: { values: MachineDetailsInput; type: MachineTypeOption; currency: string; money?: boolean }) {
  const specs = specRows(type.specFields, values.specs);
  return (
    <div className="flex flex-col gap-5">
      <DetailList items={[
        { label: "Manufacturer", value: values.manufacturer || "Not specified" }, { label: "Model", value: values.model || "Not specified" },
        { label: "Serial number", value: values.serialNumber || "Not specified" }, { label: "Location", value: values.location || "Not specified" },
        { label: "Firmware version", value: values.firmwareVersion || "Not specified" }, { label: "Acquired on", value: values.acquiredOn || "Not specified" },
        ...(money ? [{ label: `Purchase cost (${currency})`, value: values.purchaseCost || "Not specified" }] : []),
      ]} />
      {values.description ? <div><h3 className="text-label text-ink">Description</h3><p className="whitespace-pre-wrap break-words text-body-ui text-ink-secondary">{values.description}</p></div> : null}
      {values.notes ? <div><h3 className="text-label text-ink">Staff notes</h3><p className="whitespace-pre-wrap break-words text-body-ui text-ink-secondary">{values.notes}</p></div> : null}
      <SectionHeading as="h3" title="Specifications" />
      {specs.length ? <DetailList items={specs.map((row) => ({ label: row.label, value: row.value }))} /> : <p className="text-body-ui text-ink-muted">No specifications recorded.</p>}
    </div>
  );
}
