import { Check } from "lucide-react";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, STAFF_ROLES } from "@/lib/permissionRoles";
import { cn } from "@/lib/cn";
import { BOARD, JOURNEY, SAMPLE_SPACE } from "./landingData";
import { SectionHeading } from "./SectionHeading";

const TONES = {
  citron: "bg-sw-citron text-sw-ink",
  sky: "bg-sw-sky text-sw-ink",
  yellow: "bg-sw-yellow text-sw-ink",
  teal: "bg-sw-teal text-sw-cream",
  panel: "border border-line bg-panel text-ink",
} as const;

/** The hero's sample machine board, dealt in one card at a time. */
export function MachineBoard() {
  return (
    <figure aria-label={`Sample machine board for ${SAMPLE_SPACE}`} className="flex w-full flex-col gap-3">
      {BOARD.map((machine, index) => (
        <div
          key={machine.name}
          className={cn("landing-deal flex items-center gap-3.5 rounded-xl border border-line bg-panel p-4", index % 2 ? "ml-6 rotate-[0.6deg]" : "-rotate-[0.6deg]")}
          style={{ ["--rise-delay" as string]: `${200 + index * 110}ms` }}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sw-sky text-sw-ink"><machine.icon aria-hidden className="size-5" /></span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-label text-ink">{machine.name}</span>
            <span className="truncate text-caption text-ink-muted">{machine.meta}</span>
          </span>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold", TONES[machine.tone])}>{machine.status}</span>
        </div>
      ))}
      <figcaption className="text-caption text-ink-muted">Sample machine board</figcaption>
    </figure>
  );
}

/** One job from file to finished part: every capability where it happens. */
export function JobSection() {
  return (
    <section aria-labelledby="how-it-works" className="scroll-mt-20 bg-canvas">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading id="how-it-works" title={<>One file. <span className="font-accent" style={{ fontWeight: 700 }}>One finished part.</span></>}>
          Follow a sample job at {SAMPLE_SPACE} through one morning. Every step is something staff no longer chase by hand.
        </SectionHeading>
        <ol className="relative flex flex-col">
          <span aria-hidden className="absolute bottom-6 left-[5.5rem] top-6 w-px bg-line max-sm:left-[0.4375rem]" />
          {JOURNEY.map((stop) => (
            <li key={stop.title} className="sr-left relative grid gap-x-8 gap-y-2 py-6 max-sm:pl-8 sm:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,0.9fr)_minmax(0,1fr)]">
              <span aria-hidden className="absolute left-[5.25rem] top-[1.95rem] size-2.5 rounded-full border-2 border-primary bg-canvas max-sm:left-[0.1875rem]" />
              <p className="pt-0.5 text-label font-semibold tabular-nums text-ink-muted">{stop.when}</p>
              <div className="flex flex-col gap-1.5 sm:pl-6">
                <h3 className="text-h3 text-ink">{stop.title}</h3>
                <p className="max-w-[46ch] text-body-ui text-ink-secondary">{stop.body}</p>
              </div>
              <div className="sm:col-start-2 sm:pl-6 lg:col-start-3 lg:pl-0 lg:pt-1">{stop.proof}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Upkeep: the service card is the proof. */
export function UpkeepSection() {
  return (
    <section aria-labelledby="upkeep" className="bg-sw-ink text-sw-cream dark:border-y dark:border-line dark:bg-[color-mix(in_srgb,var(--sw-ink)_55%,black)]">
      <div className="mx-auto grid w-full max-w-[1160px] items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-28">
        <div className="flex flex-col gap-8">
          <SectionHeading id="upkeep" inverse title={<>Machines that<br />keep running.</>}>
            Service by the calendar or by hours used, fault reports from anyone at the machine, and spools and sheets counted as they are used.
          </SectionHeading>
          <ul className="flex flex-col gap-4">
            {[
              "Maintenance schedules by time or by usage, with a technician's checklist.",
              "Faults take a machine out of the queue until someone signs it off.",
              "Warranty dates and service history kept beside each machine.",
            ].map((point) => (
              <li key={point} className="sr-left flex gap-3 text-body-ui text-sw-cream/85">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sw-citron text-sw-ink">
                  <Check aria-hidden className="size-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <figure className="landing-print rounded-[20px] bg-sw-cream p-6 text-sw-ink sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-dashed border-sw-ink/25 pb-4">
            <div>
              <p className="text-h4">CNC router</p>
              <p className="text-caption text-sw-ink/70">{SAMPLE_SPACE} · Workshop floor</p>
            </div>
            <span className="rounded-full bg-sw-yellow px-2.5 py-0.5 text-caption font-semibold">Due soon</span>
          </div>
          <dl className="flex flex-col gap-2 py-4 text-body-ui">
            {[["Spindle hours since service", "94 of 100"], ["Last service", "12 Sep · Ajzal P"], ["Open faults", "None"], ["Warranty", "Until Mar 2027"]].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt>{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <figcaption className="text-caption text-sw-ink/70">Sample service card</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** Scale: many spaces on one install, and the roles inside each. */
export function SpacesSection() {
  return (
    <section aria-labelledby="scale" className="bg-canvas">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading id="scale" title={<>One install.<br />Every makerspace.</>}>
          Run one workshop, or a network of them. Each space has its own staff, makers, machines, prices and payment account, and never sees another&apos;s.
        </SectionHeading>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STAFF_ROLES.map((role, index) => (
            <li key={role} className="sr-up flex flex-col gap-2 rounded-[20px] border border-line bg-panel p-6" style={{ ["--sr-offset" as string]: index * 4 }}>
              <span className="text-label font-semibold text-ink">{ROLE_LABELS[role]}</span>
              <span className="text-body-ui text-ink-secondary">{ROLE_DESCRIPTIONS[role]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
