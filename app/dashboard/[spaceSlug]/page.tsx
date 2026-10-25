import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import { loadSpaceOverviewView } from "@/lib/views/app__dashboard__spaceSlug__page";
import { ROLE_LABELS } from "@/lib/permissionRoles";
import { STATUS_EXPLANATIONS } from "@/lib/spaceLifecycle";
import { SpacePageHeader } from "@/components/dashboard/space/SpacePageHeader";
import { buttonClasses } from "@/components/ui/button";
import { Callout, StatTile } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";

export const metadata: Metadata = { title: "Overview", robots: { index: false, follow: false } };

export default async function SpaceOverviewPage({ params }: { params: Promise<{ spaceSlug: string }> }) {
  const { space, role, staffCount, makers, pending, openInvites, steps, finance } = await loadSpaceOverviewView({ params });
  const remaining = steps.filter((step) => !step.done).length;
  const base = `/dashboard/${space.slug}`;
  return (
    <div className="flex flex-col gap-6">
      <SpacePageHeader space={space} title="Overview" description={`You're ${/^[AEIOU]/.test(ROLE_LABELS[role]) ? "an" : "a"} ${ROLE_LABELS[role].toLowerCase()} here.`} />

      {space.status !== "ACTIVE" ? (
        <Callout
          tone="danger"
          title={STATUS_EXPLANATIONS[space.status].title}
          action={<Link href={`/dashboard/${space.slug}/application`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Details</Link>}
        >
          {STATUS_EXPLANATIONS[space.status].body}
        </Callout>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile className="rounded-xl" label="Makers" value={makers.toLocaleString("en-IN")} hint={pending ? `${pending} waiting for approval` : "No one waiting"} href={`${base}/team`} />
        <StatTile className="rounded-xl" label="Staff" value={staffCount.toLocaleString("en-IN")} hint={openInvites ? `${openInvites} open invite${openInvites === 1 ? "" : "s"}` : "No open invites"} href={`${base}/team`} />
        {finance?.totals.map((total) => <StatTile key={total.currency} className="rounded-xl" label={`Net this month (${total.currency})`} href={`${base}/finance`}
          value={isCurrencyCode(total.currency) ? formatMoney(total.net, total.currency) : String(total.net)}
          hint={`In ${isCurrencyCode(total.currency) ? formatMoney(total.income, total.currency) : total.income} · out ${isCurrencyCode(total.currency) ? formatMoney(total.spending, total.currency) : total.spending}`} />)}
      </div>

      {steps.length > 0 ? (
        <CollapsibleSection id="overview-setup" title="Get set up" count={remaining} description={remaining ? `${remaining} of ${steps.length} left` : "All done. Nice work."}>
          <ol className="flex flex-col divide-y divide-line">
            {steps.map((step) => (
              <li key={step.id}>
                <Link href={step.href} className="group flex items-center gap-4 py-3.5">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border",
                      step.done ? "border-transparent bg-success-bg text-success-fg" : "border-line-strong text-transparent",
                    )}
                  >
                    <Check className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("text-label font-semibold", step.done ? "text-ink-muted line-through" : "text-ink")}>
                      <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                      {step.label}
                    </span>
                    <span className="text-caption text-ink-muted">{step.description}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ol>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
