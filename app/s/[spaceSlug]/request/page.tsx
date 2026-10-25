import type { Metadata } from "next";
import { loadJobRequestView } from "@/lib/views/app__s__spaceSlug__request__page";
import { RequestForm } from "@/components/jobs/RequestForm";

export const metadata: Metadata = { title: "Request a job", robots: { index: false, follow: false } };
export default async function RequestPage(props: Parameters<typeof loadJobRequestView>[0]) {
  const view = await loadJobRequestView(props);
  return <div className="mx-auto flex max-w-[1120px] flex-col gap-7 px-4 py-10 sm:px-6"><header><h1 className="text-display-m">Request a job</h1><p className="mt-3 text-body-l text-ink-secondary">Tell {view.space.name} what you would like to make.</p></header><RequestForm {...view} /></div>;
}
