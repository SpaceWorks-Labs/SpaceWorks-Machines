"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/menu";
import { updateAccountProfile } from "@/app/actions/account";
import { uploadAccountProfileImage } from "@/app/actions/media";
import { ImageUploadPicker } from "@/components/forms/ImageUploadPicker";
import { useToast } from "@/components/feedback/ToastProvider";
import { AccountCard } from "@/components/account/AccountCard";

export function AccountProfileForm(props: {
  initialName: string;
  email: string | null;
  image: string | null;
  profileImageUrl: string | null;
}) {
  const {
    email,
    image,
    profileImageUrl: initialProfileImageUrl,
  } = props;
  const router = useRouter();
  const [name, setName] = useState(props.initialName);
  const [profileImageUrl, setProfileImageUrl] = useState(
    initialProfileImageUrl ?? "",
  );
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const avatarSource =
    profileImageUrl.trim() || image || undefined;
  const avatarSourceDescription = profileImageUrl.trim()
    ? "Custom profile image."
    : image
      ? "Profile image from your sign-in provider."
      : "Shows your initials until you add an image.";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          let uploadedUrl = profileImageUrl;
          if (profileImageFile) {
            const upload = new FormData();
            upload.set("file", profileImageFile);
            const response = await uploadAccountProfileImage(upload);
            if (!response.ok) {
              setError(response.error);
              showToast(response.error, "error");
              return;
            }
            if (!response.data) {
              setError("Could not upload the profile image.");
              showToast("Could not upload the profile image.", "error");
              return;
            }
            uploadedUrl = response.data.url;
          }
          const result = await updateAccountProfile({
            name,
            profileImageUrl: uploadedUrl,
          });
          if (!result.ok) {
            setError(result.error);
            showToast(result.error, "error");
            return;
          }
          setName(result.data?.name ?? name.trim());
          setProfileImageUrl(result.data?.profileImageUrl ?? "");
          setProfileImageFile(null);
          showToast("Profile saved", "success");
          // Refresh the account header and sidebar with the saved name/photo.
          router.refresh();
        });
      }}
    >
      <AccountCard id="account-profile" title="Profile" description="Your display name and photo across Space Works Machines.">
        <div className="flex flex-col gap-6">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={name || email} src={avatarSource} className="size-[72px] text-2xl" />
              <div className="min-w-0">
                <p className="truncate text-[17px] font-bold text-ink">{name || "Your profile"}</p>
                <div className="flex items-center gap-1">
                  <p className="text-caption text-ink-muted">{avatarSourceDescription}</p>
                  <Tooltip content="Remove your uploaded image to use your sign-in provider's image, or your initials.">
                    <IconButton label="Profile image source" size="sm" className="shrink-0 [&_svg]:size-4"><Info /></IconButton>
                  </Tooltip>
                </div>
              </div>
            </div>
            <ImageUploadPicker
              initialUrl={initialProfileImageUrl}
              label="Profile image"
              placeholder="Your uploaded profile image will appear here."
              disabled={pending}
              objectFit="cover"
              onChange={(file, previewUrl) => {
                setProfileImageFile(file);
                setProfileImageUrl(previewUrl);
              }}
            />
          </div>
          <Field label="Display name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} />
          </Field>
          <div className="flex justify-end border-t border-line pt-5">
            <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </AccountCard>
    </form>
  );
}
