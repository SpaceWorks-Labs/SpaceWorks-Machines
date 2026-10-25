"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSpaceDetails } from "@/app/actions/space";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { CURRENCIES } from "@/lib/money/currencies";

export type SpaceDetails = {
  contactEmail: string; contactPhone: string; website: string; addressLine: string; city: string; region: string;
  postalCode: string; country: string; timezone: string; currency: string; locale: string;
};

const TEXT_FIELDS: Array<{ key: keyof SpaceDetails; label: string; type?: string; autoComplete?: string; max: number; help?: string }> = [
  { key: "contactEmail", label: "Contact email", type: "email", autoComplete: "email", max: 320, help: "Makers see it on your public page; replies to space emails go here." },
  { key: "contactPhone", label: "Contact phone", type: "tel", autoComplete: "tel", max: 32 },
  { key: "website", label: "Website", type: "url", max: 300 },
  { key: "addressLine", label: "Address", autoComplete: "street-address", max: 200 },
  { key: "city", label: "City or town", autoComplete: "address-level2", max: 80 },
  { key: "region", label: "State or region", autoComplete: "address-level1", max: 80 },
  { key: "postalCode", label: "Postal code", autoComplete: "postal-code", max: 12 },
  { key: "country", label: "Country code", autoComplete: "country", max: 2, help: "Two letters, for example IN." },
];

/** Contact details, address, time zone, currency and number format. */
export function SpaceDetailsForm({ spaceSlug, initial }: { spaceSlug: string; initial: SpaceDetails }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof SpaceDetails) => (event: { target: { value: string } }) => setValues({ ...values, [key]: event.target.value });

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="Details" description="How makers reach you, and the time zone and currency the space works in." />
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setErrors({});
          startTransition(async () => {
            const result = await updateSpaceDetails({ spaceSlug, ...values });
            if (!result.ok) {
              setError(result.error);
              setErrors(result.fieldErrors ?? {});
              return;
            }
            showToast("Details saved", "success");
            router.refresh();
          });
        }}
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {TEXT_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} optional={field.key !== "country"} required={field.key === "country"} helperText={field.help} error={errors[field.key]?.[0]}>
              <Input value={values[field.key]} onChange={set(field.key)} type={field.type ?? "text"} autoComplete={field.autoComplete} maxLength={field.max} disabled={pending} />
            </Field>
          ))}
          <Field label="Time zone" required helperText="An IANA name, for example Asia/Kolkata." error={errors.timezone?.[0]}>
            <Input value={values.timezone} onChange={set("timezone")} maxLength={64} disabled={pending} />
          </Field>
          <Field label="Currency" required helperText="Prices and payments use this currency." error={errors.currency?.[0]}>
            <Dropdown value={values.currency} onChange={set("currency")} disabled={pending}>
              {Object.entries(CURRENCIES).map(([code, currency]) => <option key={code} value={code}>{`${code} · ${currency.name}`}</option>)}
            </Dropdown>
          </Field>
          <Field label="Number format" optional helperText="A locale such as en-IN. Leave empty to follow the currency." error={errors.locale?.[0]}>
            <Input value={values.locale} onChange={set("locale")} maxLength={20} disabled={pending} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" loading={pending}>Save details</Button>
        </div>
      </form>
    </Card>
  );
}
