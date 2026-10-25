"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { resubmitSpaceApplication } from "@/app/actions/space-application";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { AboutFields, ContactFields, type FieldErrors, type ProfileValues } from "./SpaceProfileFields";

/** Edit the application after a platform admin asked for changes, then send it again. */
export function ResubmitApplicationForm({ spaceSlug, initial }: { spaceSlug: string; initial: ProfileValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await resubmitSpaceApplication({ ...values, spaceSlug });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      setErrors({});
      router.refresh();
    });
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      {formError ? <Callout tone="danger" role="alert">{formError}</Callout> : null}
      <AboutFields values={values} onChange={setValues} errors={errors} disabled={pending} />
      <ContactFields values={values} onChange={setValues} errors={errors} disabled={pending} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="lg" loading={pending}>Send application again</Button>
      </div>
    </form>
  );
}
