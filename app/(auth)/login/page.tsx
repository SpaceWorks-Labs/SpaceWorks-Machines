import { loadLoginView } from "@/lib/views/app__auth__login__page";
import { Suspense } from "react";
import { Check, Printer, Wrench, Zap, type LucideIcon } from "lucide-react";
import { LoginForm } from "./ui";
import { BrandHomeLink } from "@/components/chrome/SiteHeader";
import { SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** An illustrative machine row for the brand panel (product proof, not live data). */
function SampleMachine({ icon: Icon, name, meta, status, tone, className }: { icon: LucideIcon; name: string; meta: string; status: string; tone: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3.5 rounded-xl border border-line bg-panel p-4 ${className ?? ""}`}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sw-sky text-sw-ink"><Icon className="size-5" /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-label text-ink">{name}</span>
        <span className="truncate text-caption text-ink-muted">{meta}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold text-sw-ink ${tone}`}>{status}</span>
    </div>
  );
}

export default async function LoginPage() {
  const { accountCreationEnabled } = await loadLoginView();
  return (
    <div className="grid min-h-dvh bg-canvas md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-5 sm:px-8 sm:py-6">
        <header>
          <BrandHomeLink />
        </header>
        <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center py-10 focus:outline-none">
          <div className="flex w-full max-w-[400px] flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-display-l text-ink">Welcome back.</h1>
              <p className="text-body-ui text-ink-secondary">
                Sign in with your password, or have a one-time link emailed to you.
                {accountCreationEnabled ? " New here? Create an account in seconds." : null}
              </p>
            </div>
            <Suspense fallback={<p className="text-body-ui text-ink-muted">Loading sign in…</p>}>
              <LoginForm accountCreationEnabled={accountCreationEnabled} />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Brand panel: the stacked lockup, the accent phrase and a few real product objects. */}
      <aside aria-hidden className="relative hidden overflow-hidden p-4 md:block">
        <div className="relative flex h-full flex-col justify-between gap-10 overflow-hidden rounded-[16px] bg-surface p-12">
          <SpaceWorksLogo variant="lockup-stacked" height={72} className="self-start" />
          <div className="relative flex flex-col gap-4 py-6">
            <span className="absolute -right-16 -top-10 size-44 rounded-full bg-sw-citron" />
            <span className="absolute -bottom-2 right-20 size-20 rounded-[16px] bg-sw-sky" />
            <SampleMachine icon={Printer} name="Prusa MK4 · Bay 2" meta="Job 0142 · 3 h 10 min left" status="Printing" tone="bg-sw-citron" className="relative -rotate-2 max-w-[360px]" />
            <SampleMachine icon={Zap} name="Laser cutter 60 W" meta="Next: acrylic sign for Midlaj C" status="Queued" tone="bg-sw-sky" className="relative ml-12 max-w-[340px] rotate-1" />
            <SampleMachine icon={Wrench} name="CNC router" meta="Spindle service due in 6 h of use" status="Due soon" tone="bg-highlight" className="relative max-w-[340px] -rotate-1" />
            <span className="relative ml-4 inline-flex items-center gap-2 self-start rounded-full bg-sw-citron px-4 py-2 text-label text-sw-ink">
              <Check className="size-4" />
              Abhiram NJ&apos;s print approved
            </span>
          </div>
          <p className="relative flex items-end justify-between gap-6">
            <span className="font-accent text-[34px] font-medium leading-[1.1] text-ink">Machines,<br />humming.</span>
            <span className="size-14 shrink-0 rounded-tl-full bg-highlight" />
          </p>
        </div>
      </aside>
    </div>
  );
}
