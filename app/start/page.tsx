import Link from "next/link";
import type { Metadata } from "next";
import { loadStartView } from "@/lib/views/app__start__page";
import { ApplicationForm } from "@/components/onboarding/ApplicationForm";
import { SpaceStatusChip } from "@/components/space/SpaceStatusChip";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";

export const metadata: Metadata = { title: "Apply for a space", robots: { index: false, follow: false } };

export default async function StartPage() {
  const { applicantEmail, emailVerified, applicationsOpen, openApplications } = await loadStartView();
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 text-ink">Run your makerspace here</h1>
        <p className="text-body-ui text-ink-secondary">
          Tell us about your space. A platform admin reviews each application and emails you the decision. Once approved,
          you can invite your staff, add your machines and open the doors to makers.
        </p>
      </header>

      {openApplications.length > 0 ? (
        <section aria-labelledby="open-applications" className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <h2 id="open-applications" className="text-label font-semibold text-ink">Your applications waiting for a decision</h2>
          <ul className="flex flex-col divide-y divide-line">
            {openApplications.map((space) => (
              <li key={space.slug} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/dashboard/${space.slug}/application`} title={space.name} className="min-w-0 truncate text-body-ui text-ink underline-offset-4 hover:underline">
                  {space.name}
                </Link>
                <SpaceStatusChip status={space.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!applicationsOpen ? (
        <Callout tone="info" title="Not taking applications">
          This platform isn&apos;t taking new space applications right now. Contact its operator to have one set up for you.
        </Callout>
      ) : !emailVerified ? (
        <Callout
          tone="warning"
          title="Verify your email first"
          action={<Link href="/account" className={buttonClasses({ variant: "secondary", size: "sm" })}>Go to your account</Link>}
        >
          We email you about the decision, so your address needs to be verified before you apply.
        </Callout>
      ) : (
        <div className="rounded-xl border border-line bg-panel p-5 sm:p-8">
          <ApplicationForm applicantEmail={applicantEmail} />
        </div>
      )}
    </div>
  );
}
