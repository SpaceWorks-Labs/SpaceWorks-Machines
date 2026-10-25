"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSpace } from "@/app/actions/space";
import { uploadSpaceLogo } from "@/app/actions/media";
import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";
import { useToast } from "@/components/feedback/ToastProvider";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Callout, SpaceLogo } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";

type SpaceProfile = { name: string; description: string; logoUrl: string | null };

/**
 * Space profile card: logo, name and description with a live preview
 * of the public space header. Nothing is persisted until "Save changes".
 */
export function EditSpaceForm(props: {
  spaceSlug: string;
  initial: SpaceProfile;
  /** Element id for the card, used by the settings section nav. */
  id?: string;
}) {
  const { spaceSlug, initial, id } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<SpaceProfile>(initial);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(initial.logoUrl ?? "");
  // Remounts the picker so Discard also resets its internal preview.
  const [pickerKey, setPickerKey] = useState(0);

  const dirty =
    name !== saved.name ||
    description !== saved.description ||
    logoFile !== null ||
    logoPreviewUrl !== (saved.logoUrl ?? "");
  useUnsavedChangesGuard(dirty && !pending);

  const previewName = name.trim() || "Your space";

  function discard() {
    setName(saved.name);
    setDescription(saved.description);
    setLogoFile(null);
    setLogoPreviewUrl(saved.logoUrl ?? "");
    setPickerKey((key) => key + 1);
    setError(null);
    setFieldErrors({});
  }

  return (
    <form
      id={id}
      aria-labelledby={titleId}
      className="scroll-mt-20 overflow-hidden rounded-xl border border-line bg-panel lg:scroll-mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFieldErrors({});
        startTransition(async () => {
          let logoUrl = logoFile ? "" : logoPreviewUrl;
          if (logoFile) {
            const upload = new FormData();
            upload.set("spaceSlug", spaceSlug);
            upload.set("file", logoFile);
            const result = await uploadSpaceLogo(upload);
            if (!result.ok) {
              setError(result.error);
              showToast(result.error, "error");
              return;
            }
            if (!result.data) {
              setError("Could not upload the logo.");
              showToast("Could not upload the logo.", "error");
              return;
            }
            logoUrl = result.data.url;
          }
          const res = await updateSpace({
            spaceSlug,
            name,
            description,
            logoUrl,
          });
          if (!res.ok) {
            setError(res.error);
            setFieldErrors(res.fieldErrors ?? {});
            showToast(res.error, "error");
            return;
          }
          showToast("Space saved", "success");
          setSaved({ name, description, logoUrl: logoUrl || null });
          setLogoFile(null);
          setLogoPreviewUrl(logoUrl);
          router.refresh();
        });
      }}
    >
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 id={titleId} className="text-h4 text-ink">Profile</h2>
        <p className="mt-0.5 text-body-ui text-ink-muted">Shown on your public page and in emails to makers.</p>
      </div>

      <div className="grid gap-6 px-5 pb-6 pt-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-5">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-label text-ink">Logo</span>
            <ImageUploadPicker
              key={pickerKey}
              initialUrl={saved.logoUrl}
              label="Logo"
              placeholder="Your logo will appear here."
              objectFit="cover"
              disabled={pending}
              onChange={(file, previewUrl) => {
                setLogoFile(file);
                setLogoPreviewUrl(previewUrl);
              }}
            />
          </div>

          <Field label="Name" required error={fieldErrors.name?.[0]}>
            <Input name="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Description" helperText="Shown under your name on the public page." error={fieldErrors.description?.[0]}>
            <Textarea name="description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <aside aria-label="Public page preview" className="flex min-w-0 flex-col gap-2">
          <span className="text-overline text-ink-muted">Preview · public page</span>
          <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-raised">
            <div aria-hidden className="sw-dot-strip h-14" />
            <div className="flex flex-col gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
              <SpaceLogo name={previewName} src={logoPreviewUrl || null} size="lg" className="-mt-7 border-[3px] border-canvas" />
              <span className="wrap-break-word font-display text-[22px] font-semibold leading-tight text-ink">{previewName}</span>
              {description.trim() ? (
                <p className="line-clamp-4 whitespace-pre-line wrap-break-word text-sm text-ink-secondary">{description}</p>
              ) : (
                <p className="text-sm italic text-ink-muted">A sentence or two about your makerspace.</p>
              )}
            </div>
          </div>
          <span className="text-caption text-ink-muted">Updates as you type. Nothing changes until you save.</span>
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-subtle px-5 py-3.5 sm:px-6">
        <span role="status" className="min-w-0 flex-1 text-sm text-warning-solid">
          {dirty ? "You have unsaved changes" : null}
        </span>
        <Button type="button" variant="quiet" onClick={discard} disabled={!dirty || pending}>
          Discard
        </Button>
        <Button type="submit" variant="primary" disabled={pending} loading={pending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
