# CLAUDE.md

> **Start here:** `docs/DECISIONS.md` explains what this repo is (a standalone app split out of SpaceWorks, part of the SpaceWorks-HQ family) and holds every decision: the locked ones, the owner's, the defaults taken while building and the checks still waiting on the owner.

Guidance for Claude Code (and other agents, via `AGENTS.md`) in this repository. `CLAUDE.md` is a byte-identical
copy of `AGENTS.md` (`tests/unit/agent-guide.test.ts`); edit `AGENTS.md` and copy it over.

## Project

**Space Works Machines** is a self-hostable (AGPL-3.0-or-later), multi-space machine management platform for
makerspaces: machine types and machines, job requests with a queue, pricing and payments, consumables,
maintenance and usage, and 3D printer connections. One install runs several makerspaces ("spaces"); the
platform super admin creates them or reviews the ones that apply. It is fully standalone: its own accounts, no
SSO, and no dependency on the other Space Works apps (it links to them later only through its REST API and
outbound webhooks).

- **Build plan:** `docs/plans/2026-10-23-machines-build.md` holds the locked decisions and the phases. Follow it
  phase by phase; each phase ends with lint, typecheck, unit and integration tests green.
- **Origins:** the platform layer is forked from SpaceWorks-Organization 0.7.0; the BullMQ worker and beat follow
  SpaceWorks-Workspace. Domain logic is ported (not copied) from the Django SpaceWorks apps.

## Stack

- **App framework:** Next.js 16 (App Router, React Server Components, Server Actions), React 19, TypeScript
  strict, with `@/*` as the path alias for the repo root.
- **Data:** PostgreSQL 16 through Prisma 6 (`prisma/schema.prisma`). `DATABASE_URL` is the runtime/pooled
  connection; `DIRECT_URL` is for migrations. `scripts/prisma.mjs` defaults it to `DATABASE_URL`.
- **Services:**
  - Redis (ioredis) for rate limits, and BullMQ queues for background jobs
  - S3-compatible private storage (Silo on a VPS, R2 or any S3 in the cloud)
  - Nodemailer behind a database outbox
- **Design:**
  - **Brand:** SpaceWorks-Design is the only source of brand truth (tokens, logos, fonts, Patch), vendored with
    `node scripts/sync-design.mjs <path>` and `node scripts/sync-patch.mjs <path>`; `brand/SOURCE.json` records
    the design commit.
  - **UX:** Space Works UX, from SpaceWorks-Design `docs/ux-spec.md` and `docs/ui-brand-spec.md`.
  - **Buttons and controls:** pill-shaped (`--radius-control: 9999px`). No card shadows.
  - **Fonts:** only the free Gilroy weights (Light 300 for text, ExtraBold 800 for headings), plus Unbounded for
    one accent phrase per layout.
  - **Colour mode:** light and dark, chosen by cookie (`lib/colorMode.ts`).
  - **Patch (mascot):** `components/brand/Patch.tsx`. Never recolour, mirror or resize it past native size, never
    beside the box logo, and it counts as a layout's one bold moment. See `docs/DESIGN.md`.

## Commands

```bash
npm ci                     # install (runs prisma generate)
npm run dev                # dev server on :3000
npm run lint               # ESLint (next core-web-vitals + typescript + max-lines 300)
npm run typecheck          # next typegen + tsc --noEmit
npm run test:unit          # Vitest unit tests (tests/unit)
npm run test:integration   # needs TEST_DATABASE_URL pointing at a disposable Postgres
npm run test:e2e           # Playwright (tests/e2e)
npm run build              # production build (standalone output)
npm run build:jobs         # esbuild bundles dist/worker.js and dist/beat.js
npm run worker             # BullMQ worker (after build:jobs; needs REDIS_URL)
npm run beat               # BullMQ beat (after build:jobs; needs REDIS_URL)
npm run frontend:catalog   # regenerate lib/frontend/registry.ts and frontend/catalog.json
npm run typecheck:frontend # typecheck the split-hosting frontend workspace
npm run db:migrate         # create/apply a migration in development
npm run db:deploy          # apply migrations
```

Operations (bash; see `docs/DEPLOYMENT_VPS.md`, `docs/DEPLOYMENT_CLOUD.md`, `docs/CONFIGURATION.md`):

```bash
bash setup.sh [--build]                                  # guided install from a checkout (setup.ps1 on Windows)
scripts/spaceworks-compose.sh bundled up -d              # the only way to run docker-compose.prod.yml
scripts/spaceworks-compose.sh bundled run --rm ops       # operator checks
scripts/spaceworks-compose.sh cloud up -d                # docker-compose.cloud.yml with /etc/spaceworks-machines/cloud.env
bash scripts/update.sh --force [--version V | --rollback]
bash scripts/backup.sh && bash scripts/restore.sh backups/<dump>.sql.gz [--with-storage]
bash scripts/admin.sh create|set-password|reset-mfa|revoke|list --email <address>   # super admins (server only)
SWM_COMPOSE_BUILD_LAYER=1 bash scripts/compose-smoke.sh  # bundled stack end to end (disposable)
```

Run one unit test file: `npx vitest run tests/unit/permission-roles.test.ts`.

## Conventions

- **Tenancy.** `Space` is the tenant. Application code enforces isolation (there is no RLS):
  - Every tenant row carries `spaceId`, with composite FKs to its parent where a child belongs to a space row.
  - Every query is scoped through the space resolved for the request: pages call `requireSpaceCapability`
    (or `requireSpaceTeam` for screens that must work before approval), actions call `spaceActionAccess`
    (`lib/permissions.ts`).
  - Cross-space access returns 404 ("Space not found."), never "forbidden".
  - A space's status gates what it can do (`spaceAllows`): nothing before approval; suspended and archived
    spaces keep read access and settling money already received.
- **Roles and capabilities** (`lib/permissionRoles.ts`, the only place they are defined):
  - `SpaceRole`: MACHINE_MANAGER ("Machine manager"), TYPE_MANAGER ("Machine type manager"), OPERATOR,
    TECHNICIAN, VIEWER are staff; MEMBER ("Maker") submits jobs and holds no staff capability. There is no
    owner or space manager role, and copy never calls a role "owner".
  - The Machine manager is the top role and holds every capability: settings, money (`payments.*`), the team
    (other machine managers too), integrations, `machine.settings` (job settings, space-default prices,
    creating, archiving and ordering types) and `space.delete`. Only machine managers manage anyone
    (`canManageTeamMember`, `assignableRoles`).
  - The last active machine manager can't be removed, demoted or leave (`isLastActiveManager` in
    `lib/lastManager.ts`, which locks the space row; call it inside the change's transaction).
  - Machine type managers hold the machine side (`machines.manage`, `type.settings`, `printers.manage`, jobs,
    `maintenance.manage`, reports, audit) only for the types in `TypeManagerAssignment`, set on the Team page.
    `lib/typeScope.ts` is the one place for scope: access contexts carry `typeScope` (null = every type);
    loaders filter with `typeWhere`/`machineTypeWhere` and 404 outside it; domain functions that take an
    `actorId` check `actorMayUseType`/`actorMayUseMachine` and throw their not-found error. Pick assignees and
    alert recipients with `rolesForType`. Operators run jobs and consumables; technicians run maintenance;
    viewers read.
  - `SpaceMember` holds one row per person and space, with `status` ACTIVE, PENDING or BLOCKED (only makers
    are ever PENDING or BLOCKED; a check constraint enforces it). Makers join through the space's
    `joinPolicy` (`joinAsMaker` in `lib/spaceMembers.ts`): OPEN joins at once, APPROVAL waits for a machine
    manager, INVITE_ONLY only through `SpaceInvite`. `memberLimit` and `staffLimit` are checked with `hasSeat`.
  - Dashboard navigation (`SPACE_NAV` in `components/chrome/AppShell.tsx`) shows an entry when the role holds
    any of its capabilities; every route re-checks on the server.
- **Settings are audited.** Every settings change writes `recordSettingsChange` (`lib/audit.ts`) with the
  area and the changed field names (never values), inside the change's transaction. Other important actions
  call `recordAuditEvent` with minimal, non-personal metadata.
- **Accounts and sign-in** (`docs/SECURITY.md`):
  - Email and password, or an emailed magic link (`lib/magicLink.ts`: 32 random bytes, stored as a SHA-256
    hash, 15 minutes, single use, rate limited, the same answer whether or not the address has an account).
    The `/login/link` page uses the link only when the person presses "Sign in". Accounts with an
    authenticator always give its code after either method. There are no OAuth or SSO providers.
  - Super admins sign in with email and password only (never a magic link), and are created, revoked and
    given passwords only on the server (`docker/ops/admin.mjs` through `scripts/admin.sh`). Never add an in-app
    or emailed way to make a super admin or reset their password; `requireSuperAdmin` checks only
    `User.isSuperAdmin`.
  - Staff (any role except MEMBER) need an authenticator before the dashboard opens: `requireSpaceTeam` and
    `spaceActionAccess` check `hasAuthenticator`. Makers never need one.
  - New browsers: `lib/loginSecurity.ts` (known-device cookie, emailed code for accounts without an
    authenticator, new-device alert). Failed sign-ins feed `lib/ipBlock.ts`. Every new password passes
    `isBreachedPassword` (`lib/breachedPassword.ts`).
- **Money** (Phase 3 builds payments for jobs):
  - Amounts are integer minor units (paise, cents) with the space's ISO `currency`; never add across currencies.
  - Each space uses its own Razorpay or Stripe account (`SpacePaymentSettings`, secrets AES-GCM encrypted with
    `PAYMENT_SECRETS_KEY` and bound to the space) or offline payments recorded by staff, with the optional
    maker-checker rule `Space.offlineConfirmationRequired`.
  - Gateways live in `lib/payments/` (`razorpay.ts`, `stripe.ts`, `config.ts`). Webhooks
    (`/api/webhooks/{razorpay,stripe}/<code>`) are verified per space and applied once through
    `ProcessedWebhookEvent` (`lib/payments/webhooks.ts`; `applyGatewayEvent` is where Phase 3 settles jobs).
- **Background jobs** (BullMQ, `lib/queue/`):
  - Named queues in `definitions.ts`: `outbox`, `scheduled`, `sync`. Redis carries ids and registry names only.
  - Periodic work is a `JobDefinition` in `lib/queue/registry.ts` (`SCHEDULED_JOBS`); later phases add entries
    there and nowhere else. The `beat` role (`scripts/queue/beat.ts`) upserts the repeatable schedules; the
    `worker` role (`scripts/queue/worker.ts`) runs them and delivers outbox rows one id at a time. Both are
    bundled by `scripts/build-jobs.mjs` into `dist/` and expose `/health` on `JOBS_HEALTH_PORT`.
  - Hosts without a beat can call `POST /api/internal/jobs` and `/api/internal/outbox` with `CRON_SECRET`.
  - Local development without Redis may set `JOBS_INPROCESS=true` for a one-minute in-process outbox timer.
- **Notifications** (`docs/NOTIFICATIONS.md`):
  - Emails are outbox rows (`enqueueOutbox` in `lib/outbox.ts`, kinds in `lib/outboxKinds.ts`), queued in the
    same transaction as the change they report. Rows carrying a bearer link are deleted once sent.
  - Maker-facing emails pass `spaceId` to `sendBrandedEmail`, which uses the space's own SMTP
    (`SpaceEmailSettings`) or the platform's in its name. Account emails never pass it.
  - Staff chat alerts (Slack, Discord, Mattermost, Telegram, WhatsApp) are queued with `queueChatAlerts` in the
    event's transaction (`lib/chat/*`); events are listed in `lib/chat/events.ts`. Space secrets use
    `encryptSpaceSecret`; hosts a space types in must pass `assertPublicHost`.
- **Single writers.** Job status changes only in `lib/jobs/transitions.ts`; usage logs and machine meters only in
  `lib/usage/record.ts`; consumable quantities only through `lib/consumables`. Upkeep lives in `lib/upkeep`
  (schedules, records, downtime, faults, warranty, sweeps), reports in `lib/reports` (pure maths in `compute.ts`).
- **Integrations.** `/api/v1` routes go through `apiRoute` (`lib/api/handler.ts`): key, scope, and for writes the
  key creator's current capability. Webhooks: `emitWebhook` in the change's transaction, delivery and retries in
  `lib/webhooks/deliver.ts`. Printers: adapters in `lib/printers`; only the manual and simulated ones are
  available, the rest stay "Coming soon" until they are built and tested against real hardware.
- **Files:** private S3-compatible storage (`lib/storage/`), served only through `/api/uploads/...`; images
  pass `lib/imageValidation.ts` (re-encoded, metadata stripped).
- **Frontend gateway:** pages read data only through loaders in `lib/views/` (one file per route, named after
  it) and change it only through `app/actions/`. `npm run frontend:catalog` regenerates the allowlist
  (`lib/frontend/registry.ts`, `frontend/catalog.json`); the split-hosting frontend reaches the backend only
  through the signed gateway (`FRONTEND_GATEWAY_SECRET`). Run it after adding or renaming a loader or action.
- **File size:** no source file over 300 lines (owner rule). Split by responsibility; ESLint `max-lines` and
  `tests/unit/file-length.test.ts` enforce it, skipping generated files.
- **Operations:**
  - Two images from one `Dockerfile`: `spaceworks-machines-backend` (`runner`; every backend role through
    `scripts/docker-entrypoint.sh --role backend|migrate|worker|beat|ops`) and `spaceworks-machines-frontend`
    (`frontend`). Public origins are placeholders replaced at start; never bake an installation's key or origin.
  - Every new environment variable goes into `.env.example`, `.env.production.example`, the compose
    `x-app-env` blocks, `render.yaml` when needed, and `docs/CONFIGURATION.md`.
  - Shell scripts are bash or POSIX sh, LF, and pass `shellcheck -S warning -x`. Host files an update must
    replace are listed in `scripts/install-host-bundle.sh`.
- **Copy:** sentence case, en-GB, buttons named after their action, no "Oops" or exclamation marks on errors,
  and the product is "Space Works Machines" (never "SpaceWorks") in anything a person reads.
- **Line endings:** LF everywhere (see `.gitattributes`). Never commit `.env*` files except the `*.example` ones.
- **Branches and releases:** two long-lived branches only. Work lands on `dev` (pushes publish gated `dev` test
  images); `dev` merges to `main`, which publishes the release images and the GitHub Release, and the one-line
  install installs from `main`. Only @Shaan-Shoukath pushes or merges to `main` (branch protection,
  `.github/CODEOWNERS`). No feature or phase branches are kept.
- **Commit trailers:**
  ```
  Co-Authored-By: Shaan-Shoukath <shaanshoukath4522@gmail.com>
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
