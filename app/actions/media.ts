"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, getMembership, hasAuthenticator, spaceAllows, STAFF_AUTHENTICATOR_MESSAGE } from "@/lib/permissions";
import { SPACE_LOCKED } from "@/lib/spaceLifecycle";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { createSafeWebpDerivative } from "@/lib/imageValidation";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { recordAuditEvent } from "@/lib/audit";
import type { ActionResult } from "./space";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function imageFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File))
    return { error: "Choose an image to upload." } as const;
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES)
    return { error: "Images must be 5 MB or smaller." } as const;
  const derivative = await createSafeWebpDerivative(file, {
    width: 1200,
    height: 1200,
    fit: "inside",
  });
  return derivative;
}

export async function uploadSpaceLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("upload", session.user.id))
    return { ok: false, error: "Too many uploads. Please try again later." };
  const slug = String(formData.get("spaceSlug") ?? "").trim();
  const space = slug
    ? await prisma.space.findUnique({
        where: { slug },
        select: { id: true, slug: true, status: true },
      })
    : null;
  if (!space) return { ok: false, error: "Space not found." };
  if (!spaceAllows(space.status, "space.settings")) return { ok: false, error: SPACE_LOCKED };
  const membership = await getMembership(session.user.id, space.id);
  if (!membership || !can(membership.role, "space.settings"))
    return { ok: false, error: "Only machine managers can upload logos." };
  if (!(await hasAuthenticator(session.user.id))) return { ok: false, error: STAFF_AUTHENTICATOR_MESSAGE };
  const derivative = await imageFile(formData);
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `spaces/${space.id}/space-logos/${crypto.randomUUID()}.webp`;
    await uploadFile({
      key,
      body: derivative.body,
      contentType: "image/webp",
      spaceId: space.id,
    });
    await recordAuditEvent({
      action: "SPACE_LOGO_UPLOADED",
      actorUserId: session.user.id,
      spaceId: space.id,
      targetType: "Space",
      targetId: space.id,
    });
    return { ok: true, data: { url: getPublicUrl(key) } };
  } catch {
    console.error("[media] space logo upload failed");
    return { ok: false, error: "Could not upload the space logo." };
  }
}

export async function uploadAccountProfileImage(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be signed in." };
  if (await isActionRateLimited("upload", session.user.id))
    return { ok: false, error: "Too many uploads. Please try again later." };
  const derivative = await imageFile(formData);
  if ("error" in derivative) return { ok: false, error: derivative.error };
  try {
    const key = `users/${session.user.id}/profile-images/${crypto.randomUUID()}.webp`;
    await uploadFile({
      key,
      body: derivative.body,
      contentType: "image/webp",
      userId: session.user.id,
    });
    await recordAuditEvent({
      action: "ACCOUNT_PROFILE_IMAGE_UPLOADED",
      actorUserId: session.user.id,
      targetType: "User",
      targetId: session.user.id,
    });
    return { ok: true, data: { url: getPublicUrl(key) } };
  } catch {
    console.error("[media] account profile image upload failed");
    return { ok: false, error: "Could not upload the profile image." };
  }
}
