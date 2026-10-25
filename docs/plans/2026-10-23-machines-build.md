# Space Works Machines: build plan

Space Works Machines is a self-hosted, multi-space machine management tool for makerspaces. One install
runs several makerspaces ("spaces"); every tenant row carries `spaceId` and every query is scoped by the
space resolved for the request. It is fully standalone: its own accounts, no SSO, no dependency on the
other Space Works apps. It links to them later only through its REST API (API keys) and outbound webhooks.

## Origins

The platform layer (accounts, MFA, sign-in protections, super admin, outbox email, chat alerts, storage,
payments gateways, frontend gateway, Docker images, installer, compose and Render files) is forked from
SpaceWorks-Organization 0.7.0 and adapted. BullMQ worker + beat follow SpaceWorks-Workspace. Domain logic
is ported (not copied) from the Django SpaceWorks apps `machines`, `printing`, `maintenance`, `warranty`
and the machine parts of `payments`.

## Locked decisions

- Stack: Next.js 16, React 19, TypeScript strict, Prisma 6 on PostgreSQL 16, Auth.js v5, Tailwind 4 with
  Radix primitives, Redis (ioredis + BullMQ), S3-compatible private storage (Silo on a VPS), Nodemailer
  behind a database outbox, Vitest and Playwright.
- Tenancy: `Space` is the tenant. Cross-space access returns 404.
- Roles (`SpaceRole`, as changed by the owner on 2026-10-24, see `docs/DECISIONS.md`): MACHINE_MANAGER (the
  top role: everything, including settings, money, people and integrations), TYPE_MANAGER (the machine side
  for assigned types only), OPERATOR, TECHNICIAN, VIEWER are staff and need an authenticator; MEMBER is a
  maker who submits jobs. Capabilities live in `lib/permissionRoles.ts`.
- No training, certification or machine access gating.
- Money is integer minor units (paise/cents) with an ISO currency per space. Payments: Razorpay, Stripe
  (each space's own account, secrets encrypted) and offline (cash, bank, UPI recorded by staff).
- Two GHCR images: `spaceworks-machines-backend` (roles: backend, migrate, worker, beat, ops) and
  `spaceworks-machines-frontend` (split hosting).
- Source files stay at or under 300 lines (ESLint `max-lines` and a unit test).
- Design: SpaceWorks-Design is the only source of brand truth.

## Phases

Each phase ends with lint, typecheck, unit + integration tests green, a commit and a push to `dev`.

1. **Foundation**: fork the Organization platform, strip membership domain, rename tenant to Space,
   space roles and capabilities, member join policy, magic-link sign-in, BullMQ worker + beat, first
   migration, Machines branding, agent guide.
2. **Machines**: machine types (built-in presets + custom) with type-specific fields and capabilities,
   machine instances per space, status, photos, public machine pages, consumable pools.
3. **Jobs**: job requests with file upload validated per type file policy, queue and position, review,
   lifecycle, pricing engine, payments (Razorpay, Stripe, offline), consumable deduction, notifications.
4. **Upkeep**: usage metering, maintenance schedules (time/usage), downtime, fault reports, warranty,
   service history, reports and exports.
5. **Integrations**: printer connections and the typed adapter layer (manual/simulated working; OctoPrint,
   Moonraker, Bambu, PrusaLink stubbed and shown "Coming soon"), REST API with API keys, outbound
   webhooks, audit log views.
6. **Ship**: deploy files verified, README, docs, e2e journeys, design polish, independent review.
