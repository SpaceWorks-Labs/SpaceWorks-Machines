import type { ReactNode } from "react";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { EmptyState } from "@/components/ui/display";

/** A real dashboard route whose content arrives in a later phase. */
export function ComingSoon({ space, title, description, icon, heading, children }: {
  space: { name: string; slug: string; logoUrl: string | null };
  title: string;
  description: string;
  icon: ReactNode;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SpacePageHeader space={space} title={title} description={description} />
      <EmptyState icon={icon} title={heading}>{children}</EmptyState>
    </div>
  );
}
