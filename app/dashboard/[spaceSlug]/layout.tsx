import { loadSpaceSlugShell } from "@/lib/views/app__dashboard__spaceSlug__layout";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export default async function SpaceSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ spaceSlug: string; }>;
}) {
  const { space } = await loadSpaceSlugShell({ params });
  return (
    <DashboardLayout
      spaceName={space.name}
      spaceSlug={space.slug}
    >
      {children}
    </DashboardLayout>
  );
}
