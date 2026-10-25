import Link from "next/link";
import { requireSuperAdmin } from "@/lib/permissions";
import { ArrowLeft } from "lucide-react";
import { loadSuperAdminNewSpaceView } from "@/lib/views/app__super-admin__spaces__new__page";
import { CreateSpaceForm } from "@/components/super-admin/CreateSpaceForm";
import { PageHeader } from "@/components/ui/display";

export default async function SuperAdminNewSpacePage() {
  await requireSuperAdmin();
  await loadSuperAdminNewSpaceView();
  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Link href="/super-admin/spaces" className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline">
        <ArrowLeft aria-hidden className="size-4" />
        Spaces
      </Link>
      <PageHeader title="Add a space" description="Skip the application: set it up as active and invite its machine manager." />
      <CreateSpaceForm />
    </div>
  );
}
