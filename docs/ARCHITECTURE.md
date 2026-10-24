# Architecture

## Application

One Next.js 16 application (App Router, React Server Components, Server Actions) with Prisma 6 on
PostgreSQL 16. Makerspaces ("spaces") are tenants: every tenant row carries `spaceId`, every query is scoped
through the space resolved for the request, and cross-space access returns 404 ("Space not found."). There is
no database row-level security; isolation is enforced in the application.

| Area | Where |
|---|---|
| Pages and Server Actions | `app/`, `components/`, loaders in `lib/views/`, actions in `app/actions/` |
| Tenancy, roles and capabilities | `lib/permissionRoles.ts` (the only place roles are defined), `lib/permissions.ts`, `lib/spaceMembers.ts` |
| Sign-in | Auth.js v5 credentials (`lib/auth.ts`): email and password, emailed magic link (`lib/magicLink.ts`), authenticator MFA (`lib/mfa.ts`), new-browser checks (`lib/loginSecurity.ts`) |
| Payments (settings and webhooks) | `lib/payments/` |
| Email | Nodemailer behind a database outbox (`lib/outbox.ts`, kinds in `lib/outboxKinds.ts`) |
| Chat alerts | `lib/chat/` |
| Background jobs | BullMQ (`lib/queue/`, entry points in `scripts/queue/`) |
| Files | S3-compatible storage (`lib/storage/`), served only through `/api/uploads/...` |
| Rate limits and address blocks | Redis (`lib/rateLimit.ts`, `lib/ipBlock.ts`) |
| Audit | `lib/audit.ts` (`recordAuditEvent`, `recordSettingsChange`) |
| Start-up validation | `lib/env.ts`, called from `instrumentation.ts` and from the worker and beat |

### Routes

| Path | Who | What |
|---|---|---|
| `/` | everyone | Landing page |
| `/spaces` | everyone | Directory of spaces the super admin has made `PUBLIC` |
| `/s/[spaceSlug]` | everyone | A space's public page, in its own accent, with the join card |
| `/start` | signed-in people | Apply to run a space here |
| `/join/space/[token]` | invitees | Accept an invite to a space |
| `/account` | everyone signed in | Your spaces, profile, data and privacy, security |
| `/dashboard/[spaceSlug]` | staff | Overview, Machines, Jobs, Maintenance, Consumables, Payments, Reports, Integrations, Team, Space settings, Machine settings |
| `/super-admin` | super admins | Spaces, users, email outbox, security, monitoring, operations, storage, audit, settings |

The dashboard navigation (`SPACE_NAV` in `components/chrome/AppShell.tsx`) shows an entry when the person's
role holds any of its capabilities; every route checks again on the server. In Phase 1 the machine, job,
maintenance, consumable, payment, report and integration pages are placeholders (`ComingSoon`); Team,
Space settings (profile, payments, email, notifications) and the application status page work.

### Spaces, roles and joining

- `Space` holds the makerspace's profile (name, slug, description, logo, accent colour, contact details and
  address), its `timezone` (default `Asia/Kolkata`), `currency` (ISO 4217, default `INR`) and `locale`, its
  lifecycle `status` and `source`, the super admin's `visibility` (`PUBLIC` or `UNLISTED`), `memberLimit` and
  `staffLimit`, the `joinPolicy` and the offline-payment rule `offlineConfirmationRequired`.
- A space starts as `PENDING_REVIEW` (applied at `/start`) or is created directly by the super admin, who
  invites its machine manager. Review moves it to `ACTIVE`, `CHANGES_REQUESTED` or `REJECTED`; it may later be
  `SUSPENDED` or `ARCHIVED`. `spaceAllows` gates capabilities by status: nothing before approval, and only
  reading and settling money already received while suspended or archived.
- `SpaceMember` holds one row per person and space with a `SpaceRole`: `MACHINE_MANAGER` ("Machine manager", the top
  role), `TYPE_MANAGER` ("Machine type manager", scoped to the types in `TypeManagerAssignment`), `OPERATOR`,
  `TECHNICIAN` and `VIEWER` are staff; `MEMBER` ("Maker") is not. Only makers can be `PENDING` or `BLOCKED` (a check constraint enforces it).
- Makers join through the space's `joinPolicy`: `OPEN` joins at once, `APPROVAL` waits for a machine manager,
  `INVITE_ONLY` works only through a `SpaceInvite`. Seat limits are checked with `hasSeat`.

### Background jobs

Background work runs on BullMQ in two processes built from the backend image:

- **`beat`** (`scripts/queue/beat.ts`, `dist/beat.js`) upserts the repeatable schedules from
  `SCHEDULED_JOBS` in `lib/queue/registry.ts` once per start, and removes schedules whose entry is gone.
- **`worker`** (`scripts/queue/worker.ts`, `dist/worker.js`) runs every queue: registry entries by name, and
  outbox rows one id at a time.

| Queue | Carries | Default concurrency |
|---|---|---|
| `outbox` | Email and chat outbox rows, by id | 5 |
| `scheduled` | Periodic registry entries | 2 |
| `sync` | Slow outbound calls (printer connections, webhooks; from Phase 5) | 2 |

Phase 1 registers three entries: `outbox-relay` (every minute: queue due outbox rows), `operational-retention`
(hourly: expired tokens, invites and old outbox rows) and `worker-heartbeat` (every minute). Later phases add
their own entries to the registry and nowhere else.

- Redis carries only row ids and registry names, never email content, links or personal data. PostgreSQL is
  the durable outbox and owns delivery retry timing.
- Jobs retry eight times with exponential backoff; the failed set is the dead-letter store (30 days, at most
  5,000). Stored error messages are stripped of URLs, bodies and credentials.
- Both processes validate the environment at start and answer `GET /health` on `JOBS_HEALTH_PORT` (3460),
  healthy only while their Redis heartbeat is fresh.
- Hosts that cannot keep a beat process call `POST /api/internal/jobs` (the registry) and
  `POST /api/internal/outbox` once a minute with `Authorization: Bearer $CRON_SECRET`; a worker still runs the
  jobs. Time-bucket job ids make repeated calls in the same minute harmless.
- Local development without Redis may set `JOBS_INPROCESS=true`: the web process then delivers the outbox and
  purges old data from a one-minute timer (`lib/outboxWorker.ts`). Production never does this.

`npm run build:jobs` (`scripts/build-jobs.mjs`, esbuild) bundles both entry points into `dist/`.

## Images and roles

Two images come from the one `Dockerfile` and are published to GHCR by `.github/workflows/release.yml`:

| Image | Target | Roles (`scripts/docker-entrypoint.sh --role …`) |
|---|---|---|
| `spaceworks-machines-backend` | `runner` | `backend` (web app and API, `node server.js`), `migrate` (`prisma migrate deploy`), `worker` (`node dist/worker.js`), `beat` (`node dist/beat.js`), `ops` (operator checks) |
| `spaceworks-machines-frontend` | `frontend` | `frontend`: the website alone for split hosting (the `frontend/` workspace) |

Release images are identical for every installation. The public origins compiled into Next.js are placeholders
(`spaceworks-machines-origin.invalid`, `spaceworks-machines-backend.invalid`) that the entrypoint
replaces at start from `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_BACKEND_ORIGIN`. The Server Actions key used to
build is a throwaway; web roles refuse to start without the installation's own key. PostgreSQL, Redis, Silo and
Caddy run from their own upstream images.

## Deployment topologies

```
Bundled (docker-compose.prod.yml)                       Cloud (docker-compose.cloud.yml)

 internet ── caddy :80/:443 ──┐  edge network            platform TLS ── backend :8080
                              ▼                              worker, beat ──┤
            backend   worker   beat                          migrate (one-shot)
               │  (TLS, private CA)    data network                   │
   ┌───────────┼───────────┐  (internal, no egress)        managed PostgreSQL, Redis (TLS),
   db        redis       minio ◄─ createbuckets             S3/R2 bucket, SMTP relay
   ▲ migrate (owner role)  ▲ backup-storage
   └ backup (pg_dump)
```

- **Bundled:** everything on one server through `scripts/spaceworks-compose.sh bundled`, with overlays for
  automatic HTTPS (`docker/compose.tls.yml`), an existing proxy (`docker/compose.proxy.yml`), an external
  bucket (`docker/compose.external-storage.yml`) and source builds (`docker/compose.build.yml`).
  PostgreSQL, Redis and Silo accept TLS only, with certificates from the install's private CA
  (`deploy/certificates.sh`). Migrations run as the owner role `swmach`; the app, worker and beat run as
  `swmach_app`, which can read and write data but cannot change the schema or roles.
- **Cloud:** the backend image's roles on any Docker host (`scripts/spaceworks-compose.sh cloud`) or on Render
  (`render.yaml`), with managed services.
- **Split:** the website on Netlify (or the frontend image) and the backend in either topology above; the
  website reaches the backend only through the signed gateway (`frontend/catalog.json`,
  `FRONTEND_GATEWAY_SECRET`). See [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md).

## Database

The schema lives in `prisma/schema.prisma`; the first migration is `prisma/migrations/0001_init`. Check
constraints in the migration back up rules the application also enforces (slug format, positive seat limits,
ISO currency and country codes, staff always `ACTIVE`, allowed SMTP ports, outbox state shapes).

## Releases

`VERSION` selects the series (0.1.0). Every push to `main` runs the tests, publishes both images (amd64 and
arm64) tagged `<VERSION>-main.<run>.<sha>` and `sha-<sha>`, creates a GitHub release with that tag, promotes
the images to `latest`, `main` and the series, prunes superseded image versions (keeping the previous release
for rollback) and, with `SWM_DEPLOY=true`, deploys through a self-hosted runner. Pushes to `dev` publish images
tagged `dev` and `<VERSION>-dev.<run>.<sha>` only. The installer and updater accept only published,
non-prerelease `main` releases.
