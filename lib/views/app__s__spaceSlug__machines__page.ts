import { cache } from "react";
import { prisma } from "@/lib/db";
import { loadPublicMachineSpace } from "@/lib/publicSpace";
import { PUBLIC_MACHINE, PUBLIC_PHOTO, publicMachine, publicPhoto } from "@/lib/machines/publicQueries";

const readView = cache(async (spaceSlug: string) => {
  const space = await loadPublicMachineSpace(spaceSlug);
  const rows = await prisma.machine.findMany({
    where: { spaceId: space.id, isPublic: true, retiredAt: null },
    orderBy: [{ type: { sortOrder: "asc" } }, { type: { name: "asc" } }, { name: "asc" }, { slug: "asc" }],
    select: { ...PUBLIC_MACHINE,
      photos: { where: { spaceId: space.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: PUBLIC_PHOTO },
    },
  });
  const machines = rows.map((row) => ({ ...publicMachine(row), cover: row.photos[0] ? publicPhoto(row.photos[0]) : null }));
  const groups = [...Map.groupBy(machines, (machine) => machine.type.slug).values()]
    .map((machines) => ({ type: machines[0].type, machines }));
  return { space, groups };
});

export async function loadPublicMachinesView({ params }: { params: Promise<{ spaceSlug: string }> }) {
  return readView((await params).spaceSlug);
}
