# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Machine managers:** the people who run a makerspace, fab lab or college workshop (the top role).
  They look after the space as a whole: its profile, who may join, staff, payments, email and notifications.
  Today they juggle sign-up sheets, chat groups and UPI screenshots.
- **Machine staff:** machine managers, operators and technicians. They review and run jobs, keep consumables
  stocked, and log maintenance and faults. Viewers read along.
- **Makers:** students, hobbyists and members who submit jobs, pay for them and collect the results. They need
  a free account but never an authenticator.
- **Self-hosters:** the developer or IT volunteer a space forwards the link to, who decides whether to install
  it on a VPS or a free cloud stack.
- **Platform operators:** run an instance, review spaces that apply, and keep it healthy.

## Product Purpose
A self-hostable, multi-space platform for running a makerspace's machines: machine types and a catalogue, job
requests with a queue, pricing and payments (Razorpay, Stripe, offline), consumables, maintenance and usage
logs, and 3D printer connections. Success is a space where a maker can see what a machine is doing, submit a
job and know where it stands, and where staff stop chasing files, payments and service dates across chat
threads and spreadsheets.

## Positioning
Open source (AGPL-3.0-or-later), self-hostable and fully standalone: its own accounts, no SSO, and no
dependency on the other Space Works apps (it links to them later only through its REST API and outbound
webhooks). Built for Indian makerspaces first (rupees, UPI-friendly offline payments with maker-checker
confirmation, Asia/Kolkata by default) but each space keeps its own currency and time zone. One instance hosts
many spaces, each reviewed before it opens.

## Operating Context
- Spaces apply at `/start`; the platform super admin approves, asks for changes or declines. The super admin can
  also set a space up directly and invite its machine manager, and decides which spaces are listed publicly at `/spaces`.
- Staff roles: machine manager, machine type manager (scoped to assigned types), operator, technician, viewer. Makers ("Maker", the
  `MEMBER` role) join through the space's join policy: open, approval or invite only.
- Staff must use an authenticator app; makers sign in with a password or an emailed link.
- Runs on a VPS (bundled PostgreSQL, Redis, Silo storage, a BullMQ worker and beat) or a cloud stack, with the
  same installer, updater and release pipeline as the other Space Works apps.

## Capabilities and Constraints
- Built in phases (`docs/plans/2026-10-23-machines-build.md`). Phase 1, the foundation, is done: spaces,
  roles, joining, sign-in, per-space payment, email and chat settings, background jobs and deployment.
- Planned but not yet built: machine types and the catalogue, job requests and the queue, pricing and job
  payments, consumables, maintenance and usage, reports, printer connections, the REST API and webhooks. Their
  dashboard areas exist as placeholders.
- Money is integer minor units in the space's own currency; amounts in different currencies are never added.
- Cross-space access is invisible (404), not "forbidden".

## Brand Commitments
- Space Works brand and Space Works UX from SpaceWorks-Design are binding. Product name: "Space Works
  Machines", never "SpaceWorks" in anything a person reads.
- Copy: sentence case, en-GB, buttons named after their action, no exclamation marks on errors.

## Evidence on Hand
- No customers, testimonials, usage numbers or benchmarks exist. Never invent them.
- Demonstration material uses sample data built around the owner and the Space Works team, with
  **SpaceWorks Kochi** as the sample makerspace on the landing page. Label it as a sample where a visitor could
  mistake it for real.
  - Shaan Shoukath, Systems Engineer
  - Abhiram NJ, Cloud Specialist
  - Abdul Samad MJ, Full Stack Developer
  - Midlaj C, Backend Engineer
  - Ajzal P, Marketing Specialist
  - Anin Arafath, App Developer

## Product Principles
1. Calm over clever: an operator between two jobs should finish the task in a minute.
2. The machine is the centre: its status, queue, consumables and service history live with it.
3. Money is exact and auditable; nothing financial is silently changed.
4. Each space is its own world: its staff, makers, prices and payment account never leak to another.
5. Self-hosting is a first-class path, not an afterthought.

## Accessibility & Inclusion
- WCAG 2.2 AA in both themes; reduced motion respected everywhere.
- Gilroy Light body text stays at 16px minimum.
- Workshop screens are often read standing up, on a phone or across a room: large targets (44px) and status
  shown as colour plus an icon plus words.
- Indian names and the ₹ sign render correctly.
