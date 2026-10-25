import { requireSuperAdmin } from "@/lib/permissions";
import { loadSuperAdminAuditView } from "@/lib/views/app__super-admin__audit__page";
import { AdminPager, AdminSearchForm } from "@/components/super-admin/AdminPanel";
import { AuditTable } from "@/components/super-admin/AuditTable";
import { PageHeader } from "@/components/ui/display";

type Props = {
  searchParams: Promise<{ q?: string; page?: string; }>;
};

export default async function SuperAdminAuditPage({ searchParams }: Props) {
  await requireSuperAdmin();
  const { q, events, page } = await loadSuperAdminAuditView({ searchParams });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Append-only security and application activity. Sensitive values are redacted before display." />
      <AdminSearchForm action="/super-admin/audit" label="Search action, actor email, space, or target type" defaultValue={q} />
      <AuditTable events={events} label="Audit log" />
      <AdminPager basePath="/super-admin/audit" query={q} page={page} />
    </div>
  );
}
