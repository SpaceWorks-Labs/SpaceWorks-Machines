# Decisions: Space Works Machines

Every decision that shapes this repo, in one place. Read it with `CLAUDE.md` (same as `AGENTS.md`); the
phase plan is `docs/plans/2026-10-23-machines-build.md`, the rules ported from Django are in
`docs/plans/domain-behaviour.md`. Re-open a decision only with the owner (@Shaan-Shoukath).

## Where this repo fits

Space Works is a family of self-hosted, open-source (AGPL-3.0-or-later) tools for makerspaces and
communities, published under the [SpaceWorks-HQ](https://github.com/SpaceWorks-HQ) GitHub org. The original
[SpaceWorks](https://github.com/SpaceWorks-HQ/SpaceWorks) (Django + React) bundled inventory, lending, machines,
3D printing, space bookings and payments. On 2026-10-23 three areas were split into standalone apps:
[SpaceWorks-Inventory](https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory),
**SpaceWorks-Machines** (this repo: machine types and catalogue, job requests, pricing and payments,
consumables, maintenance and usage, the 3D-printer adapter layer) and
[SpaceWorks-Bookings](https://github.com/SpaceWorks-HQ/SpaceWorks-Bookings).
[SpaceWorks-Events](https://github.com/SpaceWorks-HQ/SpaceWorks-Events) is the reference for structure,
install and deploy; brand and UI rules come only from
[SpaceWorks-Design](https://spaceworks-hq.github.io/SpaceWorks-Design/).

## Locked decisions (2026-10-23)

- **Stack:** Next.js 16 + React 19 + TypeScript, PostgreSQL 16 with Prisma, Auth.js, Tailwind 4 + Radix,
  Redis with a BullMQ `worker` and `beat`, S3-compatible private storage (Silo on a VPS), Vitest and
  Playwright. Domain logic is ported from the Django SpaceWorks code, not copied.
- **Multi-tenancy:** one install runs several makerspaces; every tenant row and query is scoped to one.
- **Own accounts:** email + password, magic link and TOTP MFA per app. No SSO.
- **Free and paid everywhere:** every flow works free or paid: Razorpay, Stripe, offline (cash, bank, UPI
  recorded by staff) or pay later (shown as *payment pending*), with refunds.
- **Nothing hardcoded:** behaviour lives in RBAC-gated settings, and every settings change is audited.
- **Ship requirements:** a README with real Playwright screenshots under `docs/screenshots/`, a one-line VPS
  install (`curl -fsSL …/main/install.sh | bash`) and one-click cloud hosting (`render.yaml` + Deploy to Render).
- **Machines:** no training, certification or machine-access gating (the owner excluded it). 3D-printer
  hardware is a typed adapter layer: manual and simulated work; OctoPrint, Moonraker/Klipper, Bambu (MQTT)
  and PrusaLink are stubs shown as "Coming soon". Jobs are free or paid: flat fee, per time, material or weight,
  member vs public rates, deposits or pay later, with refunds for failed or cancelled jobs.

## Owner decisions (2026-10-24)

1. **Roles.** There is no Owner and no Space manager role. The **Machine manager** (`MACHINE_MANAGER`) is the
   top role with every capability, including all settings, money, the team (other machine managers too) and
   deleting the space. Whoever creates a space (or is invited by the platform admin who set it up) becomes its
   Machine manager. A space always keeps at least one active Machine manager: removing, demoting or leaving as
   the last one is refused, transaction-safe. The Machine manager appoints **Machine type managers**
   (`TYPE_MANAGER`) to specific machine types; they get full access and settings for those types only,
   enforced on the server, and everything outside answers 404. Below them: Operator, Technician, Viewer, and
   Maker (`MEMBER`). Existing Owner and Space manager rows became Machine managers (`0004_type_managers`).
2. **Branches.** Two long-lived branches only: `dev` (integration) and `main` (production). Work lands on
   `dev`, `dev` merges to `main`, and only @Shaan-Shoukath pushes or merges to `main` (branch protection:
   push restricted to him, admins enforced, no force pushes or deletions; `.github/CODEOWNERS`).
3. **Releases.** Pushes to `dev` publish gated test images tagged `dev`; merges to `main` publish release
   images and the GitHub Release; the one-line VPS install installs from `main`.
4. **Standalone.** Every Space Works app is fully standalone: its own accounts and no runtime dependency on
   another app. Integration happens only through each app's REST API and signed webhooks.
5. **Build tooling.** Built with Claude Code; Codex implemented some earlier phases (Phase 2 UI and Phase 3)
   under Claude's prompts and review. From Phase 4 on the build is Claude Code only.
6. **README.** Follows SpaceWorks-Events: banner, light screenshots, one-line install and Deploy to Render,
   with the Patch easter eggs and the Events light/dark circular reveal.
7. **Repairs and technicians.** Every makerspace keeps a directory of many technicians: staff technicians
   (TECHNICIAN role) and outside contacts with skills and channels, managed by the Machine manager (audited).
   On a fault, a manager (or a Machine type manager for their types) picks one or more technicians and sends
   the request: email always, plus WhatsApp or Telegram when the space has that provider set up; staff also
   get an inbox item and outside technicians a private link (32 random bytes, stored as a SHA-256 hash, one
   request, closes when it expires, is withdrawn, someone else takes the repair or the fault closes). The
   first to accept is assigned and the others are told it's taken. The technician records the fix, parts,
   photos and the amount they ask and marks it fixed; a manager checks it and closes it (a corrective
   maintenance record is written) or reopens it with a reason. The Machine manager approves the amount (a
   different amount needs a reason) and records payouts, partly or in full, in an append-only payout ledger.
8. **To-buy list.** Parts and consumables are asked for (from a fault, a maintenance record or a low pool),
   approved, bought (actual amount, method, reference and supplier required) and received; receiving a
   consumable restocks its pool through `lib/consumables`.
9. **Finance.** Every money movement posts one append-only `FinanceEntry` in the same transaction as its
   source: paid job payments, succeeded refunds, repair payouts, maintenance costs, to-buy purchases,
   consumable purchases at restock and manual entries. Corrections are reversing entries with a reason.
   History before the ledger was backfilled by `0005_repairs_finance`. Finance (the page, money in reports
   and exports, spend columns, dashboard figures, payouts) is visible only to the Machine manager; other
   roles see no money totals, and a technician sees only the amount they asked and whether it was paid.
10. **Version.** The first public release is 0.5.0.
    Its CI-way browser suite, VPS and split-hosting runs are verified on GitHub CI (clean runners); the shared
    development host ran out of memory for them, while lint, typecheck, unit (597) and integration (490) passed locally.

## Defaults decided while building (revisitable)

Taken conservatively without the owner; each one may be changed.

- `install.sh --ref` is for fresh installs only; a source install moves onto releases through the update menu.
- Render runs on starter instances: its worker and beat services can't use the free plan.
- Reports use UTC calendar days for their date range, not the space's time zone.
- Money in reports (revenue, maintenance and consumable costs) is shown only to roles with `payments.view`,
  which is the Machine manager alone; every other role sees the same reports without amounts.
- A fault's reporter can add photos only within a day of reporting; makers can't see fault photos afterwards.
- API writes act as the key's creator and need their current permission; there is no separate service account.
  A key whose creator is now a Machine type manager can't write, because keys act space-wide.
- Webhook hosts are checked against private addresses when saved and before each send, without DNS pinning
  between the check and the request (the same as chat alerts).
- Printer connections allow only public hosts for future network adapters; LAN printers would need an
  explicit instance setting.
- Overdue schedules with "take out of service" only block a machine that is idle or reserved, never a running job.
- Machine type managers: job settings, space-default prices and creating, archiving or reordering types stay
  with the Machine manager (`machine.settings`); editing an assigned type and pricing its machines is
  `type.settings`. They read every consumable pool but only the Machine manager and Operators manage stock.
- A Machine type manager's audit log shows their own actions plus events on their types and those types'
  machines; reports cover their types only.
- Invites can name the Machine type manager role; types are assigned afterwards on the Team page. Changing a
  Machine type manager to another role clears their type assignments.
- A Machine type manager's own job request for a type they don't manage is theirs only as its requester.
- Fault assignees and upkeep alert emails include a Machine type manager only for their types.
- Maintenance costs post to Finance when the record is saved (the record is when the money was spent), with
  the method given (or "other"). Only the Machine manager enters a cost; other roles log maintenance without one.
- A restock posts a consumable purchase only when an amount is entered with it (a donated spool posts nothing).
- Repair requests expire after 14 days by default (`repairRequestExpiryDays`, 1 to 90); an expired request
  is marked when someone tries to answer it, not by a sweep.
- Card-terminal payments post with the method "other" (the ledger's methods are the owner's list).
- Finance periods use the space's time zone; the financial year runs 1 April to 31 March.
- Consumable cost per unit stays visible to those who manage stock (it is a rate, not a total); machine purchase
  cost is shown and edited only by the Machine manager.
- Manual finance entries have no receipt photo yet.
- Excel exports are a single sheet written without a spreadsheet library (`lib/xlsx.ts`).
- The demo's top account is `manager@demo.test` (Machine manager).
- Dashboard sections collapse; empty ones start collapsed; choice remembered per browser (`swm:dash:<id>` in
  localStorage, read after hydration). KPI tiles stay visible.
- The sidebar groups its pages (Machines, Upkeep, Money, Space); each group folds and is remembered per browser
  (`swm:nav:<group>`), and the group holding the current page is always open. Detail and report pages fold
  their secondary sections the same way; forms never fold mid-flow.

## Deferred owner checks

These need the owner's accounts or hardware.

| Check | Accepted when |
| --- | --- |
| Real Render deploy from `render.yaml` | The Blueprint deploys; web, worker and beat are healthy; sign-in, a job and an email work |
| Real VPS install (release path, and `--ref dev` before the first release) | A fresh Ubuntu server installs, `ops` checks pass, update, backup and restore work |
| GHCR images and the first release | The release workflow publishes both images and the installer pins and pulls them |
| Live Razorpay and Stripe (test mode) | One paid job and one refund per gateway settle through the real webhooks, each posting one Finance entry |
| WhatsApp and Telegram repair requests | A technician with a number or chat ID receives a request through the space's own provider and the link opens |
| Real printers (OctoPrint, Moonraker, Bambu, PrusaLink) | Each adapter is implemented against real hardware and tested before it stops being "Coming soon" |
| Branch protection and CODEOWNERS on GitHub | Only @Shaan-Shoukath can push or merge to `main`; force pushes and deletions are blocked |

## Run it locally

`cp .env.example .env`, then `npm ci && npm run db:migrate && npm run db:seed-demo && npm run dev`.
Checks: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration` (needs
Postgres), `npm run test:e2e`.
