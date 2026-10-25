import Link from "next/link";
import type { Metadata } from "next";
import { loadSpaceApplicationView } from "@/lib/views/app__dashboard__spaceSlug__application__page";
import { STATUS_EXPLANATIONS } from "@/lib/spaceLifecycle";
import { Patch } from "@/components/brand/Patch";
import { SpaceStatusChip } from "@/components/space/SpaceStatusChip";
import { ReviewHistory } from "@/components/super-admin/ReviewHistory";
import { ResubmitApplicationForm } from "@/components/onboarding/ResubmitApplicationForm";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, DetailList, PageHeader, type CalloutTone } from "@/components/ui/display";

export const metadata: Metadata = { title: "Application", robots: { index: false, follow: false } };

const TONES: Record<string, CalloutTone> = {
  PENDING_REVIEW: "info",
  CHANGES_REQUESTED: "warning",
  ACTIVE: "success",
  REJECTED: "danger",
  SUSPENDED: "danger",
  ARCHIVED: "info",
};

export default async function SpaceApplicationPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, reviews, latestNote, canEdit, isManager } = await loadSpaceApplicationView({ params });
  const explanation = STATUS_EXPLANATIONS[space.status];
  const showNote = latestNote && space.status !== "ACTIVE";
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      <PageHeader
        kicker={<SpaceStatusChip status={space.status} size="md" />}
        title={space.status === "ACTIVE" ? "Space status" : "Your application"}
        description={`${space.name} · applied ${space.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
      />

      {/* Approval is the platform letting a new pack in, so Patch sneezes its vote once. */}
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center">
        {space.status === "ACTIVE" ? <Patch pose="sneeze" size={96} className="-my-3 -ml-3" /> : null}
        <Callout
          tone={TONES[space.status]}
          title={explanation.title}
          role="status"
          className="w-full min-w-0 flex-1"
          action={space.status === "ACTIVE" ? <Link href={`/dashboard/${space.slug}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Open dashboard</Link> : undefined}
        >
          {explanation.body}
        </Callout>
      </div>

      {showNote ? (
        <Card as="section" className="rounded-xl">
          <CardHeader title="Note from the platform team" />
          <p className="whitespace-pre-wrap text-body-ui text-ink">{latestNote}</p>
        </Card>
      ) : null}

      <div className={canEdit ? "flex flex-col gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"}>
        <Card as="section" className="rounded-xl">
          {canEdit ? (
            <>
              <CardHeader title="Update your application" description="Change what the note asks for, then send it again. The platform team is told straight away." />
              <ResubmitApplicationForm
                spaceSlug={space.slug}
                initial={{
                  name: space.name,
                  description: space.description,
                  contactEmail: space.contactEmail ?? "",
                  contactPhone: space.contactPhone ?? "",
                  website: space.website ?? "",
                  addressLine: space.addressLine ?? "",
                  city: space.city ?? "",
                  region: space.region ?? "",
                  postalCode: space.postalCode ?? "",
                  country: space.country,
                }}
              />
            </>
          ) : (
            <>
              <CardHeader
                title="What you told us"
                description={space.status === "CHANGES_REQUESTED" && !isManager ? "A machine manager can update the application." : undefined}
              />
              <DetailList
                items={[
                  { label: "Name", value: space.name },
                  { label: "Web address", value: `/s/${space.slug}` },
                  { label: "Description", value: <span className="whitespace-pre-wrap">{space.description || "Not given"}</span> },
                  { label: "Email", value: space.contactEmail ?? "Not given" },
                  { label: "Phone", value: space.contactPhone ?? "Not given" },
                  { label: "Website", value: space.website ?? "Not given" },
                  { label: "Address", value: [space.addressLine, space.city, space.region, space.postalCode, space.country].filter(Boolean).join(", ") || "Not given" },
                ]}
              />
            </>
          )}
        </Card>
        <Card as="section" className="h-fit rounded-xl">
          <CardHeader title="History" titleAs="h2" />
          <ReviewHistory reviews={reviews} showActor={false} />
        </Card>
      </div>
    </div>
  );
}
