"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSpaceForOwner } from "@/app/actions/super-admin-spaces";
import { AboutFields, ContactFields, EMPTY_PROFILE, type FieldErrors, type ProfileValues } from "@/components/onboarding/SpaceProfileFields";
import { SlugField, slugFromName } from "@/components/onboarding/SlugField";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** Set up an active space and invite its machine manager by email. */
export function CreateSpaceForm() {
  const router = useRouter();
  const [values, setValues] = useState<ProfileValues>(EMPTY_PROFILE);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await createSpaceForOwner({ ...values, slug, ownerEmail });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push(`/super-admin/spaces/${result.data?.spaceId}`);
    });
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      {formError ? <Callout tone="danger" role="alert">{formError}</Callout> : null}
      <Card as="section" className="rounded-xl">
        <CardHeader title="Machine manager" description="They get an email invite that only works for this address. The space is active straight away." />
        <Field label="Machine manager's email" required error={errors.ownerEmail?.[0]}>
          <Input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} autoComplete="off" maxLength={320} disabled={pending} />
        </Field>
      </Card>
      <Card as="section" className="rounded-xl">
        <CardHeader title="Space" />
        <div className="flex flex-col gap-5">
          <AboutFields
            values={values}
            errors={errors}
            disabled={pending}
            onChange={(next) => {
              setValues(next);
              if (!slugEdited) setSlug(slugFromName(next.name));
            }}
          />
          <SlugField value={slug} serverError={errors.slug?.[0]} disabled={pending} onChange={(value) => { setSlug(value); setSlugEdited(true); }} />
        </div>
      </Card>
      <Card as="section" className="rounded-xl">
        <CardHeader title="Contact and address" />
        <div className="flex flex-col gap-5">
          <ContactFields values={values} onChange={setValues} errors={errors} disabled={pending} />
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="lg" loading={pending}>Create and invite the machine manager</Button>
      </div>
    </form>
  );
}
