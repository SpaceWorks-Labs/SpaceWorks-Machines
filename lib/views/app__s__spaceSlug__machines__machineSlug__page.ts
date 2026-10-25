import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadPublicMachineSpace } from "@/lib/publicSpace";
import { machineFileUrl } from "@/lib/machines/fileAccess";
import { PUBLIC_MACHINE, PUBLIC_PHOTO, publicMachine, publicPhoto } from "@/lib/machines/publicQueries";
import { canRequestMachine } from "@/lib/jobs/intake";
import { auth } from "@/lib/auth";

const readView = cache(async (spaceSlug: string, machineSlug: string) => {
  const space = await loadPublicMachineSpace(spaceSlug);
  const row = await prisma.machine.findFirst({
    where: { spaceId: space.id, slug: machineSlug, isPublic: true, retiredAt: null },
    select: { ...PUBLIC_MACHINE, id: true, typeId: true,
      photos: { where: { spaceId: space.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: PUBLIC_PHOTO },
      documents: { where: { spaceId: space.id, isPublic: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, title: true, storageKey: true, kind: true },
      },
    },
  });
  if (!row) notFound();
  // Signed-in active members (the space is ACTIVE here) may report a problem; nothing about the viewer is returned.
  const session = await auth();
  const member = session?.user?.id ? await prisma.spaceMember.findUnique({ where: { userId_spaceId: { userId: session.user.id, spaceId: space.id } }, select: { status: true } }) : null;
  return { space, machine: publicMachine(row), report: member?.status === "ACTIVE" ? { machineId: row.id } : null, requestHref: await canRequestMachine(space.id, row.typeId, row.id) ? `/s/${space.slug}/request?type=${row.typeId}&machine=${row.id}` : null, photos: row.photos.map(publicPhoto),
    documents: row.documents.map((document) => ({ id: document.id, title: document.title, kind: document.kind, url: machineFileUrl(document.storageKey) })),
  };
});

export async function loadPublicMachineView({ params }: { params: Promise<{ spaceSlug: string; machineSlug: string }> }) {
  const { spaceSlug, machineSlug } = await params;
  return readView(spaceSlug, machineSlug);
}
