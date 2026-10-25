import { loadPublicSpace } from "@/lib/publicSpace";

export async function loadPublicSpaceLayout({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await params;
  return { space: await loadPublicSpace(spaceSlug, true) };
}
