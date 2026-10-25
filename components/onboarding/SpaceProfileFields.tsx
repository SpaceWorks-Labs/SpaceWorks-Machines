"use client";

import { Field, Input, Textarea } from "@/components/ui/field";

/** Everything a space tells the platform about itself, as the form holds it. */
export type ProfileValues = {
  name: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type FieldErrors = Record<string, string[] | undefined>;

export const EMPTY_PROFILE: ProfileValues = {
  name: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
  addressLine: "",
  city: "",
  region: "",
  postalCode: "",
  country: "IN",
};

type Props = {
  values: ProfileValues;
  onChange: (next: ProfileValues) => void;
  errors?: FieldErrors;
  disabled?: boolean;
};

function useField(props: Props) {
  return <K extends keyof ProfileValues>(key: K) => ({
    name: key,
    value: props.values[key],
    disabled: props.disabled,
    "aria-invalid": props.errors?.[key]?.length ? true : undefined,
    onChange: (event: { target: { value: string } }) => props.onChange({ ...props.values, [key]: event.target.value }),
  });
}

/** Name and description: who the space is. */
export function AboutFields(props: Props & { autoFocus?: boolean }) {
  const field = useField(props);
  const error = (key: keyof ProfileValues) => props.errors?.[key]?.[0];
  return (
    <>
      <Field label="Space name" required error={error("name")}>
        <Input {...field("name")} autoComplete="organization" maxLength={120} autoFocus={props.autoFocus} />
      </Field>
      <Field label="What does the makerspace do, and who uses its machines?" required error={error("description")} helperText={`${props.values.description.trim().length} of at least 20 characters. The platform team reads this when reviewing.`}>
        <Textarea {...field("description")} rows={4} maxLength={2000} />
      </Field>
    </>
  );
}

/** How to reach the space, and where it is. */
export function ContactFields(props: Props) {
  const field = useField(props);
  const error = (key: keyof ProfileValues) => props.errors?.[key]?.[0];
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Contact email" required error={error("contactEmail")} helperText="Shown to makers on your public page and in emails.">
          <Input {...field("contactEmail")} type="email" autoComplete="email" inputMode="email" maxLength={320} />
        </Field>
        <Field label="Contact phone" optional error={error("contactPhone")}>
          <Input {...field("contactPhone")} type="tel" autoComplete="tel" inputMode="tel" maxLength={32} />
        </Field>
      </div>
      <Field label="Website" optional error={error("website")}>
        <Input {...field("website")} type="url" inputMode="url" placeholder="https://" maxLength={300} />
      </Field>
      <Field label="Address" optional error={error("addressLine")}>
        <Input {...field("addressLine")} autoComplete="street-address" maxLength={200} />
      </Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="City or town" required error={error("city")}>
          <Input {...field("city")} autoComplete="address-level2" maxLength={80} />
        </Field>
        <Field label="State or region" optional error={error("region")}>
          <Input {...field("region")} autoComplete="address-level1" maxLength={80} />
        </Field>
        <Field label="Postal code" optional error={error("postalCode")}>
          <Input {...field("postalCode")} autoComplete="postal-code" maxLength={12} />
        </Field>
        <Field label="Country code" required error={error("country")} helperText="Two letters, for example IN or GB.">
          <Input {...field("country")} autoComplete="country" maxLength={2} />
        </Field>
      </div>
    </>
  );
}

