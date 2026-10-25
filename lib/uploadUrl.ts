/** True only for application-controlled upload delivery URLs. */
export function isUploadedImageUrl(value: string) {
  if (/^\/api\/uploads\/.+/.test(value)) return true;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return Boolean(baseUrl && value.startsWith(`${baseUrl}/api/uploads/`));
}

export function uploadKeyFromUrl(value: string) {
  try {
    const pathname = value.startsWith("/") ? value : new URL(value).pathname;
    const prefix = "/api/uploads/";
    return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
  } catch {
    return null;
  }
}

export function isSpaceUploadUrl(
  value: string,
  spaceId: string,
  category: string,
) {
  return (
    uploadKeyFromUrl(value)?.startsWith(
      `spaces/${spaceId}/${category}/`,
    ) ?? false
  );
}

export function isUserUploadUrl(value: string, userId: string) {
  return (
    uploadKeyFromUrl(value)?.startsWith(`users/${userId}/profile-images/`) ??
    false
  );
}
