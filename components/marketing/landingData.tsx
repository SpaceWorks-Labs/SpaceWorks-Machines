import { Cog, Drill, Printer, Scissors, Zap, type LucideIcon } from "lucide-react";
import { Proof } from "./Proof";

/** Sample content for the landing page. Every person, machine and number here is labelled as a sample. */
export const GITHUB = "https://github.com/SpaceWorks-Labs/SpaceWorks-Machines";

export const SAMPLE_SPACE = "SpaceWorks Kochi";

/** The hero board: a sample makerspace's machines at one moment. */
export const BOARD: Array<{ icon: LucideIcon; name: string; meta: string; status: string; tone: "citron" | "sky" | "yellow" | "panel" | "teal" }> = [
  { icon: Printer, name: "Prusa MK4 · Bay 2", meta: "Bracket v3 for Midlaj C · 2 h 40 min left", status: "Printing", tone: "citron" },
  { icon: Zap, name: "Laser cutter 60 W", meta: "Acrylic sign · 3 jobs waiting", status: "Queued", tone: "sky" },
  { icon: Drill, name: "CNC router", meta: "Spindle service due in 6 h of use", status: "Due soon", tone: "yellow" },
  { icon: Scissors, name: "Vinyl cutter", meta: "Free since 11:20", status: "Ready", tone: "panel" },
  { icon: Cog, name: "Resin printer", meta: "Back after a tank swap", status: "Ready", tone: "teal" },
];

/** One sample job, from the file to the collected part. */
export const JOURNEY: Array<{ when: string; title: string; body: string; proof: React.ReactNode }> = [
  {
    when: "09:10",
    title: "Abhiram sends a file",
    body: "A maker picks a machine and uploads the file. The space's rules for that kind of machine check the file type and size before anyone looks at it.",
    proof: <Proof tone="panel">bracket-v3.3mf · PLA · 0.2 mm · 42 g</Proof>,
  },
  {
    when: "09:25",
    title: "An operator reviews it",
    body: "Staff see the request with everything it needs, approve it or send it back with a note, and the price is worked out from the space's own rates.",
    proof: <Proof tone="citron">Approved by Midlaj C, operator</Proof>,
  },
  {
    when: "09:26",
    title: "Pays by UPI",
    body: "Online through the space's own Razorpay or Stripe account, or cash and UPI recorded by staff, with a second person confirming when the space asks for it.",
    proof: <Proof tone="panel"><span className="tabular-nums">₹126.00 · UPI · paid</span></Proof>,
  },
  {
    when: "10:05",
    title: "Third in the queue, then printing",
    body: "The maker sees where their job stands. Material comes off the spool count as it runs, and machine hours add up towards the next service.",
    proof: <Proof tone="sky">Printing on Prusa MK4 · Bay 2</Proof>,
  },
  {
    when: "13:00",
    title: "Ready to collect",
    body: "An email when it's done, in the space's own name. The job stays in the maker's history and in the space's reports.",
    proof: <Proof tone="teal">Ready at the front desk</Proof>,
  },
];

export const FAQ = [
  {
    q: "What does it cost?",
    a: "The software is free and open source under the AGPL. If you host it yourself, you pay only for your server. Payment providers charge their usual fees on online payments.",
  },
  {
    q: "Which machines does it handle?",
    a: "3D printers, laser cutters, CNC routers, vinyl cutters and anything else you add as your own machine type, each with its own fields, file rules and pricing.",
  },
  {
    q: "Can it talk to our printers?",
    a: "Printer connections come with the integrations release: manual and simulated connections first, with OctoPrint, Moonraker, Bambu and PrusaLink to follow.",
  },
  {
    q: "Do makers need an account?",
    a: "Yes, a free one. They can sign in with a password or with a one-time link emailed to them, so there is nothing to remember.",
  },
  {
    q: "We run more than one space. Is that one install?",
    a: "Yes. One install runs as many makerspaces as you like. Each has its own staff, makers, machines, prices and payment account, and never sees another's.",
  },
  {
    q: "Who decides whether our space can join this platform?",
    a: "The people who run this instance review every application before it opens, and email you their decision. If you host it yourself, that is you.",
  },
];
