"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { submitSpaceApplication } from "@/app/actions/space-application";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, DetailList } from "@/components/ui/display";
import { AboutFields, ContactFields, EMPTY_PROFILE, type FieldErrors, type ProfileValues } from "./SpaceProfileFields";
import { SlugField, slugFromName } from "./SlugField";

const STEPS = ["About", "Contact", "Review"] as const;
const ABOUT_FIELDS = new Set(["name", "slug", "description"]);

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Application steps">
      {STEPS.map((label, index) => (
        <li key={label} aria-current={index === step ? "step" : undefined} className="flex flex-col gap-1.5">
          <span className={cn("h-1.5 rounded-full", index <= step ? "bg-accent" : "bg-emphasis")} />
          <span className={cn("text-caption", index === step ? "font-semibold text-ink" : "text-ink-muted")}>
            <span className="sr-only">{index < step ? "Done: " : index === step ? "Current: " : ""}</span>
            {`${index + 1}. ${label}`}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Apply for a new space in three short steps. Each step is its own form, so the browser checks required fields. */
export function ApplicationForm({ applicantEmail }: { applicantEmail: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ProfileValues>({ ...EMPTY_PROFILE, contactEmail: applicantEmail });
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [authorised, setAuthorised] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const goTo = (next: number) => {
    setStep(next);
    setFormError(null);
    // Move focus to the step heading so screen readers announce the new step.
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const updateAbout = (next: ProfileValues) => {
    setValues(next);
    if (!slugEdited) setSlug(slugFromName(next.name));
  };

  const next = (event: FormEvent) => {
    event.preventDefault();
    goTo(step + 1);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await submitSpaceApplication({ ...values, slug });
      if (result.ok) {
        router.push(`/dashboard/${result.data?.slug ?? slug}/application`);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error);
      const firstField = Object.keys(result.fieldErrors ?? {})[0];
      if (firstField) goTo(ABOUT_FIELDS.has(firstField) ? 0 : 1);
    });
  };

  const titles = ["Tell us about your space", "How can makers reach you?", "Check and send"];

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator step={step} />
      <h2 ref={headingRef} tabIndex={-1} className="text-h3 text-ink focus:outline-none">{titles[step]}</h2>
      {formError ? <Callout tone="danger" role="alert">{formError}</Callout> : null}

      {step === 0 ? (
        <form className="flex flex-col gap-5" onSubmit={next}>
          <AboutFields values={values} onChange={updateAbout} errors={errors} autoFocus />
          <SlugField
            value={slug}
            serverError={errors.slug?.[0]}
            onChange={(value) => {
              setSlug(value);
              setSlugEdited(true);
              setErrors((current) => ({ ...current, slug: undefined }));
            }}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="lg">Continue</Button>
          </div>
        </form>
      ) : null}

      {step === 1 ? (
        <form className="flex flex-col gap-5" onSubmit={next}>
          <ContactFields values={values} onChange={setValues} errors={errors} />
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => goTo(0)}>
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </Button>
            <Button type="submit" variant="primary" size="lg">Continue</Button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <section className="flex flex-col gap-3" aria-labelledby="review-about">
            <div className="flex items-center justify-between gap-3">
              <h3 id="review-about" className="text-label font-semibold text-ink">About</h3>
              <Button type="button" variant="quiet" size="sm" onClick={() => goTo(0)}>Edit</Button>
            </div>
            <DetailList
              className="sm:grid-cols-[8rem_minmax(0,1fr)]"
              items={[
                { label: "Name", value: values.name },
                { label: "Web address", value: `/s/${slug}` },
                { label: "Description", value: <span className="whitespace-pre-wrap">{values.description}</span> },
              ]}
            />
          </section>
          <section className="flex flex-col gap-3" aria-labelledby="review-contact">
            <div className="flex items-center justify-between gap-3">
              <h3 id="review-contact" className="text-label font-semibold text-ink">Contact</h3>
              <Button type="button" variant="quiet" size="sm" onClick={() => goTo(1)}>Edit</Button>
            </div>
            <DetailList
              className="sm:grid-cols-[8rem_minmax(0,1fr)]"
              items={[
                { label: "Email", value: values.contactEmail },
                { label: "Phone", value: values.contactPhone || "Not given" },
                { label: "Website", value: values.website || "Not given" },
                { label: "Address", value: [values.addressLine, values.city, values.region, values.postalCode, values.country].filter(Boolean).join(", ") },
              ]}
            />
          </section>
          <CheckboxField
            checked={authorised}
            onCheckedChange={(checked) => setAuthorised(checked === true)}
            label="I'm allowed to apply for this space"
            description="You'll be its machine manager here. A platform admin reviews every application before it opens."
          />
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => goTo(1)} disabled={pending}>
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={pending} disabled={!authorised}>Send application</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
