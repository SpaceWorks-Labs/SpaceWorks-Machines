# Changelog

Releases are published from `main` and titled **`Space Works Machines <version>`**. The root `VERSION`
file selects the series; each build is tagged `v<series>-main.<run>.<sha>`, which is what a deployment pins
to. Pushes to `dev` publish staging images tagged `dev` without a release.

## 0.6.0 - 2026-10-30

- Require current MFA and machine-type permissions for private files.
- Protect active jobs and downtime from conflicting machine state changes.
- Pin validated outbound addresses and audit SMTP settings atomically.
- Provide the complete supervised local PostgreSQL, Redis, Silo and Mailpit stack.
- Preserve Sharp native companions and non-root public asset access in packaged builds.
- Make encrypted recovery atomic, keep backup schedulers paused until readiness, and prove fresh-volume restore with worker email.
- Remove inherited npm tooling from runtime images and build the patched standard Caddy edge locally.

## 0.5.0

The first public release: everything since Space Works Machines was split out of SpaceWorks (0.1.0 and 0.2.0
below were never released on their own), plus repairs, technicians, the to-buy list, finance and the new roles.

- **Repairs and technicians.** A technician directory per space (staff technicians and outside contacts with
  skills, email, WhatsApp and Telegram). From a fault, ask several technicians at once: email always, WhatsApp or
  Telegram through the space's own provider, an inbox for staff and a private hashed link for outside
  technicians. The first to accept takes the repair and the rest are told. The technician records the fix,
  parts, photos and the amount they ask; a manager checks and closes it (writing a corrective maintenance
  record) or reopens it with a reason. Migration `0005_repairs_finance`.
- **Payouts.** The machine manager approves the amount (a reason when it differs) and pays in parts or in full by
  cash, bank transfer or UPI, in an append-only payout ledger with a Payouts page and repair-spend export.
- **To-buy list.** Parts and consumables asked for from a fault, a maintenance record or a low pool, approved,
  bought (amount, method, reference and supplier) and received; receiving a consumable restocks its pool.
- **Finance.** One append-only ledger for every money movement, posted in the same transaction as its source:
  job payments and refunds, repair payouts, maintenance costs, purchases, restocks with a cost and manual
  entries, with reversals for corrections and a backfill of earlier payments, refunds and maintenance costs.
  A Finance page by day, week, month or financial year with breakdowns and CSV and Excel export, spend per
  machine and repair spend in Reports, this month's figures on the overview, and the `finance.entry_posted` and
  `repair.paid` webhooks. Money is visible to the machine manager only.
- **Calmer dashboard.** The sidebar groups its pages (Machines, Upkeep, Money, Space) into groups that fold, and
  overview, maintenance, repairs, upkeep, fault, report and finance sections collapse from their header (with a
  count). Empty sections start collapsed and each choice is remembered in the browser. The colour-mode reveal from
  the account menu now waits for the menu to close, so no ghost of it lingers in the animation.
- **Polish.** A page-by-page pass on every screen:
  - **Layout and targets.** Every page fits a 390px phone with no sideways scroll. Every control has a 44px target,
    including small icon buttons, segmented options, footer and contents links.
  - **Tables and lists.** Ledgers, logs and other long tables keep their header pinned. Long names are cut with
    the full text on hover, and money is right-aligned.
  - **Actions and confirmations.** Each page has one primary action, and dialog submits stand out from Cancel.
    Destructive steps confirm with the danger button; removing a maker and deleting a pricing rule now ask first.
    Disabled controls say why.
  - **Folding.** Closed jobs, service history, machine photos and documents, the role reference, low-stock alerts
    and printer connection types fold. The job board drops its duplicate "Awaiting collection" list.
  - **Empty states and copy.** Lists have proper empty states. Out-of-date and exclamation-mark copy is gone,
    words standing in for icons are replaced, and README screenshots are recaptured in light and dark.
  - **Colour-mode reveal.** Element transitions now switch off only after the old mode is captured, so the
    production build no longer reveals over a blank page. Choosing a mode from the account menu with the mouse no
    longer flashes a focus ring.
- **Roles.** No owner or space manager role any more: the machine manager is the top role (settings, money,
  the team including other machine managers, deleting the space), and a space always keeps one active machine
  manager. New machine type managers get full access and settings for the machine types a machine manager
  gives them on the Team page, and nothing else (404 outside them, enforced in every loader and domain
  function). Migration `0004_type_managers` turns existing owners and space managers into machine managers.
- **Decisions.** `docs/DECISIONS.md` replaces the handoff: locked decisions, the owner's, the defaults taken
  while building and the checks still waiting on the owner.
- **CI.** Form fields render under the development server (no lazy client children), and the browser suite
  signs in from separate addresses so the sign-in rate limit holds.
- Money in reports (revenue and costs) is shown to the machine manager only.

## 0.2.0 (Unreleased)

The full machine management app: phases 2 to 6 on top of the 0.1.0 foundation.

- **Machines.** Machine types (presets and custom) with their own spec fields, request fields, file rules,
  materials and colours; machines with photos, documents, status and retirement; consumable pools with an
  append-only ledger and low-stock alerts; public machine pages at `/s/[spaceSlug]/machines`.
- **Jobs.** Requests with validated files (STL and G-code parsed for estimates), a queue with positions and an
  estimated wait, the full lifecycle (review, start, pause, complete, fail, collect, reprint, notes) through one
  transition service, the requester's job page and a private status link, the staff job board, and usage and
  machine meters through one writer (`lib/usage/record.ts`).
- **Prices and payments.** Free, flat, time, material and time-and-material pricing with member and public
  rates and tax; payment upfront, on completion (with deposits) or pay later through Razorpay Payment Links,
  Stripe Checkout or the desk (with an optional second-person check); refunds by rule or by staff; verified,
  idempotent webhook settlement. Migration `0003_job_payments`.
- **Upkeep.** Maintenance schedules by date, machine hours or job count with reminders and an optional
  out-of-service block, maintenance records with attachments, downtime, fault reports (makers from the public
  machine page), warranties with expiry reminders, per-machine service history, and reports with CSV export.
- **Integrations.** REST API `/api/v1` with per-space keys and scopes and an OpenAPI document; signed outbound
  webhooks with retries, auto switch-off and a delivery log; the printer adapter layer (manual and simulated
  working; OctoPrint, Moonraker, Bambu and PrusaLink coming soon); the audit log page.
- **Ship.** `install.sh --ref REF` builds a branch, tag or commit from source (with `GITHUB_TOKEN` for a private
  repository); README in the Space Works layout with banners and real screenshots (`npm run readme:art`,
  `npm run readme:screens`); a fuller demo seed; the colour-mode reveal now grows from the Appearance setting
  too; two new easter eggs (the layer ticker and "beep boop").
- **Tests.** The split and VPS browser suites accept `--external-services` and seed the demo, so signed-in
  journeys run there too.

## 0.1.0 (Unreleased)

Phase 1: the foundation for a multi-space machine management platform.

- **Forked from the Space Works Organization platform** (0.7.0). Its platform layer (accounts, spaces as
  tenants, super admin, outbox email, chat alerts, payment settings, storage, installer, updater, release
  pipeline and split hosting) carries over; the membership domain (plans, memberships, renewals, member cards,
  receipts and GST documents, accounts, refunds and reports) is removed.
- **Spaces as tenants.** `Space` holds a makerspace's profile, address, time zone (default Asia/Kolkata),
  currency (default INR) and locale, its review status, the super admin's `PUBLIC` or `UNLISTED` visibility,
  member and staff limits, and the offline-payment maker-checker setting. Spaces apply at `/start` or are
  created by the super admin; public pages live at `/s/[spaceSlug]` and listed spaces at `/spaces`.
  Cross-space access returns 404.
- **Roles.** OWNER, MANAGER ("Space manager"), MACHINE_MANAGER ("Machine manager"), OPERATOR, TECHNICIAN and
  VIEWER are staff; MEMBER ("Maker") submits jobs. Capabilities are defined once in `lib/permissionRoles.ts`.
  Staff need an authenticator app; makers never do. Space managers cannot change owners or other managers.
- **Joining.** Join policies OPEN, APPROVAL and INVITE_ONLY, invites by link or email, approval of waiting
  makers, and seat limits.
- **Sign-in.** Email and password, or an emailed magic link (15 minutes, single use, stored hashed, rate
  limited, the same answer for unknown addresses, never for super admins; `/login/link` waits for a button
  press). Authenticator MFA with recovery codes, new-browser codes and alerts, automatic address blocking and
  breached-password checks carry over. The Google, GitHub and Apple providers and their `AUTH_GOOGLE_*`,
  `AUTH_GITHUB_*` and `AUTH_APPLE_*` settings are removed.
- **Per-space settings.** Razorpay or Stripe keys (encrypted with `PAYMENT_SECRETS_KEY`) with verified,
  once-only webhooks, offline payment instructions, the space's own SMTP sender, and chat alerts to Slack,
  Discord, Mattermost, Telegram and WhatsApp for join requests and makers joining or leaving. Every settings
  change is audited (`SPACE_SETTINGS_CHANGED`) with the changed field names only.
- **Background jobs on BullMQ.** A `worker` and a `beat` role (`npm run build:jobs`, `dist/worker.js` and
  `dist/beat.js`) replace the scheduler pass: queues `outbox`, `scheduled` and `sync`, a job registry in
  `lib/queue/registry.ts`, and `/health` on `JOBS_HEALTH_PORT`. New settings `JOBS_QUEUE_PREFIX`,
  `JOBS_HEALTH_PORT`, `JOBS_INPROCESS` (development only) and `QUEUE_<NAME>_CONCURRENCY`. `POST
  /api/internal/jobs` joins `/api/internal/outbox` as the `CRON_SECRET` fallback for hosts without a beat.
  The `scheduler` role, its Compose services and `SCHEDULER_MODE` are removed.
- **Database.** A fresh schema with one migration, `0001_init`.
- **Machines branding.** Space Works Machines name, landing page, images
  (`spaceworks-machines-backend` and `-frontend`), host paths (`/opt/spaceworks-machines`,
  `/etc/spaceworks-machines`), `SWM_` settings and the `swmach` and `swmach_app` database roles.
- **Dashboard.** Overview, Team and Space settings work; Machines, Jobs, Maintenance, Consumables, Payments,
  Reports, Integrations and Machine settings are placeholders for later phases.
