import Link from "next/link";
import type { Metadata } from "next";
import { loadPaymentsView } from "@/lib/views/app__dashboard__spaceSlug__payments__page";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { PaymentBlock } from "@/components/jobs/PaymentBlock";
import { buttonClasses } from "@/components/ui/button";
import { PaymentFilters } from "@/components/forms/FilterForms";
import { EmptyState } from "@/components/ui/display";
import { jobNumber } from "@/lib/jobs/presentation";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };
export default async function PaymentsPage(props: Parameters<typeof loadPaymentsView>[0]) {
  const view = await loadPaymentsView(props);
  const query = new URLSearchParams(Object.entries(view.filters).filter(([, v]) => typeof v === "string"));
  return <div className="flex flex-col gap-6"><SpacePageHeader space={view.space} title="Payments" description="Payments and refunds for this space's jobs." actions={<a className={buttonClasses({ variant: "secondary" })} href={`/api/spaces/${view.space.slug}/payments/export?${query}`}>Export CSV</a>} />
    <PaymentFilters status={view.filters.status ?? ""} method={view.filters.method ?? ""} />
    {view.payments.length ? view.payments.map((p) => <section key={p.id} aria-label={`${jobNumber(p.job.number)} payment`} className="flex flex-col gap-2"><Link className="self-start break-words text-label text-accent-text underline underline-offset-4" href={`/dashboard/${view.space.slug}/jobs/${p.job.number}`}>{jobNumber(p.job.number)} · {p.job.title}</Link><PaymentBlock payments={[p]} spaceSlug={view.space.slug} manage={view.canManage} methods={view.offlineMethods} userId={view.userId} /></section>) : <EmptyState title="No payments to show" mood="sleepy">Payments appear when a paid job is approved or completed.</EmptyState>}
  </div>;
}
