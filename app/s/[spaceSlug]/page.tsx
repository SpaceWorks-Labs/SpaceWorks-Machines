import Link from "next/link";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { loadPublicSpacePage } from "@/lib/views/app__s__spaceSlug__page";
import { JoinSpaceCard } from "@/components/public/JoinSpaceCard";
import { SpaceLogo } from "@/components/ui/display";
import { buttonClasses } from "@/components/ui/button";

export default async function PublicSpacePage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, takingMakers, machinesVisible, viewer } = await loadPublicSpacePage({ params });
  const place = [space.city, space.region, space.country].filter(Boolean).join(", ");
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-12 px-4 py-10 sm:px-6 lg:py-16">
      <section aria-labelledby="space-name" className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex max-w-[720px] flex-col gap-5">
          <SpaceLogo name={space.name} src={space.logoUrl} size="xl" />
          <h1 id="space-name" className="text-display-m text-balance text-ink">{space.name}</h1>
          {space.description ? <p className="whitespace-pre-wrap text-body-l text-ink-secondary">{space.description}</p> : null}
          <JoinSpaceCard slug={space.slug} name={space.name} joinPolicy={space.joinPolicy} takingMakers={takingMakers} viewer={viewer} />
        </div>
        {place || space.contactEmail || space.contactPhone || space.website ? <dl className="flex min-w-0 shrink-0 flex-col gap-3 rounded-2xl border border-line bg-panel p-5 text-body-ui lg:w-[300px]">
          {place ? <div className="flex items-center gap-2.5"><dt className="shrink-0"><MapPin aria-hidden className="size-4 text-ink-muted" /><span className="sr-only">Location</span></dt><dd className="min-w-0 break-words">{place}</dd></div> : null}
          {space.contactEmail ? <div className="flex items-center gap-2.5"><dt className="shrink-0"><Mail aria-hidden className="size-4 text-ink-muted" /><span className="sr-only">Email</span></dt><dd className="min-w-0 truncate"><a className="underline-offset-4 hover:underline" title={space.contactEmail} href={`mailto:${space.contactEmail}`}>{space.contactEmail}</a></dd></div> : null}
          {space.contactPhone ? <div className="flex items-center gap-2.5"><dt className="shrink-0"><Phone aria-hidden className="size-4 text-ink-muted" /><span className="sr-only">Phone</span></dt><dd className="min-w-0"><a className="underline-offset-4 hover:underline" href={`tel:${space.contactPhone.replace(/\s/g, "")}`}>{space.contactPhone}</a></dd></div> : null}
          {space.website ? <div className="flex items-center gap-2.5"><dt className="shrink-0"><Globe aria-hidden className="size-4 text-ink-muted" /><span className="sr-only">Website</span></dt><dd className="min-w-0 truncate"><a className="underline-offset-4 hover:underline" title={space.website} href={space.website} rel="noopener noreferrer" target="_blank">{space.website.replace(/^https?:\/\//, "")}</a></dd></div> : null}
        </dl> : null}
      </section>

      {machinesVisible ? <section aria-labelledby="machines" className="flex flex-col items-start gap-6">
        <h2 id="machines" className="text-h2 text-ink">Machines</h2>
        <p className="text-body-l text-ink-secondary">Explore our machines, live status, specifications and documents.</p>
        <Link href={`/s/${space.slug}/machines`} className={buttonClasses({ variant: "secondary" })}>Browse machines</Link>
      </section> : null}
    </div>
  );
}
