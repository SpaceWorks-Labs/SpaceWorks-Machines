# Security

How Space Works Machines protects an installation, and what an operator must do. Report a vulnerability
privately through GitHub's **Security → Report a vulnerability** on
[SpaceWorks-Labs/SpaceWorks-Machines](https://github.com/SpaceWorks-Labs/SpaceWorks-Machines), not in a
public issue.

## Data in transit

- **Bundled stack:** PostgreSQL (`hostnossl … reject`), Redis (`port 0`, TLS only) and Silo accept TLS only,
  with certificates from a private CA created on the server (`deploy/certificates.sh`). Clients verify the
  hostname (`sslaccept=strict`, `rediss://`, `NODE_EXTRA_CA_CERTS`). The data network is internal: the data
  services have no route to the internet and publish no ports.
- **Public edge:** Caddy with automatic HTTPS (Let's Encrypt), HSTS from the app, and `/api/internal/*`
  blocked. Plain HTTP exists only for a LAN or trial and needs `ALLOW_PLAIN_HTTP=1`; the app refuses an
  `http://` origin otherwise.
- **Cloud:** production refuses database URLs without `sslmode=require|verify-ca|verify-full`, Redis without
  `rediss://`, and a non-HTTPS `S3_ENDPOINT`. The web app, worker and beat all run the same checks at start.

## Least privilege

- The app, worker and beat connect as `swmach_app`, which can read and write rows but owns no table and cannot
  create databases, roles or schema objects. Migrations run separately as the owner role `swmach`. The operator
  check (`--role ops`) verifies this on every install and update.
- The app's storage identity `swmach-app` can list, read, write and delete only in the private bucket; the
  bucket has no anonymous access.
- The backend and frontend images run as an unprivileged user; operator scripts and the Prisma CLI are
  root-owned and read-only inside the image.

## Secrets

- The installer generates every secret on the server and writes them to the install's `.env` (mode 600).
  Nothing secret is printed, passed on a command line, or baked into an image.
- Release images are built with a throwaway Server Actions key and placeholder origins; web roles refuse to
  start without the installation's own key.
- Encrypted at rest (AES-256-GCM):
  - authenticator seeds, and the SMTP password saved in Super admin → Settings, with keys derived from
    `MFA_ENCRYPTION_KEY`;
  - each space's Razorpay and Stripe secrets, its own SMTP password and its chat destinations, with keys
    derived from `PAYMENT_SECRETS_KEY` per purpose and bound to the space, so a value copied to another space
    or purpose will not decrypt.
- Losing those keys makes the saved values unreadable: keep an encrypted, off-server copy of `.env` and `tls/`
  (`bash scripts/backup.sh` archives them).
- Backups contain personal data and every secret. Copy them off the server encrypted, and restrict who can
  read `backups/`.
- The job endpoints (`POST /api/internal/jobs` and `/api/internal/outbox`, `CRON_SECRET`) and the readiness
  endpoint (`GET /api/health/db`, `HEALTHCHECK_SECRET`) answer 404 without their bearer secret.
- Background jobs carry only ids and job names through Redis: no email content, sign-in links or personal
  data. Errors stored with failed jobs are stripped of URLs, response bodies and credentials.

## Releases and automatic deploys

- The installer and updater accept only published, non-prerelease `main` releases whose tag matches
  `v<VERSION>-main.<run>.<sha>`, and pin the images to that exact version.
- This repository is public, and GitHub recommends self-hosted runners only for private repositories. The
  deploy runner controls Docker, which is root on the server. Before setting `SWM_DEPLOY=true`:
  - require approval for **all external contributors'** workflow runs;
  - protect `main` so only maintainers can merge;
  - in a GitHub organisation, limit the runner group to this repository (and to `release.yml` on
    `refs/heads/main` where your plan allows);
  - never add the `spaceworks-machines-prod` label to a `pull_request` workflow.
  The deploy job uses no checkout and no third-party actions. Keep runner auto-updates on.
- `scripts/install-runner.sh` verifies the runner download against GitHub's published SHA-256 and never echoes
  or stores the registration token.

## Application

- **Tenant isolation** in every query. A page or action for a space the person has no place in answers 404
  ("Space not found."), never "forbidden", so space addresses cannot be probed.
- **Roles and capabilities** are defined only in `lib/permissionRoles.ts` and checked on the server for every
  page and action. A space's status limits them further: nothing before approval, reading only while
  suspended or archived. Only machine managers change anyone's role, and a space always keeps one active
  machine manager. Machine type managers act only on their assigned types; everything else answers 404
  (`lib/typeScope.ts`).
- **Settings are audited.** Every settings change records an audit event (`SPACE_SETTINGS_CHANGED`) with the
  area and the names of the changed fields, never their values, in the same transaction as the change.
- **Rate limits** on sign-in, magic links and sensitive actions (Redis), with the client address taken only
  from the header your edge overwrites (`TRUSTED_PROXY_IP_HEADER`).
- **Payment webhooks** (`/api/webhooks/{razorpay,stripe}/<code>`) find the space by an unguessable code,
  accept at most 256 KB, verify the signature with that space's own secret, and record each provider event
  once (`ProcessedWebhookEvent`), however often the gateway retries.
- **Files** live in a private bucket and are served only through `/api/uploads/...`; uploaded images are
  re-encoded with their metadata stripped.

### Sign-in

There are no OAuth or SSO providers. People sign in with email and password, or with an emailed link.

- **Magic links.** A link is 32 random bytes, kept only as a SHA-256 hash, valid for 15 minutes, single use,
  and replaced by the next request. Requests are rate limited and answer the same whether or not the address
  has an account. `/login/link` uses the link only when the person presses **Sign in**, so mail scanners that
  open links do not spend it. Opening a link proves the address, so it also verifies the email.
- **Staff need an authenticator.** Anyone on a space's staff (machine manager, machine type manager, operator,
  technician, viewer) must turn on an authenticator app before the dashboard or its actions open
  (`hasAuthenticator` in `lib/permissions.ts`). Makers never need one. An account with an authenticator gives
  its code after either sign-in method; recovery codes stand in for a lost device.
- **Super admins** sign in with email and password only, never a magic link. Their accounts and passwords are
  created and changed only on the server (`scripts/admin.sh`); password-reset emails and in-app password
  changes are refused for them.
- **Unusual sign-ins.** Each browser that signs in is remembered by a long-lived random cookie (`swm.device`),
  stored only as a hash (`KnownDevice`). An account without an authenticator signing in with a password from a
  new browser must enter a six-digit code emailed to it (valid 10 minutes, single use), unless it verified its
  email in the last hour. A magic link already proves the inbox, so it skips that code.
- **New-device alerts.** Every first sign-in from a new device emails the account its browser, address and time.
- **Automatic address blocking.** Twenty failed sign-ins (wrong password, code or link) from one address within
  15 minutes block it from signing in, signing up and requesting password resets for an hour; again within a
  week, for a day. Super admin → Security lists blocks and lifts them (`lib/ipBlock.ts`).
- **Breached passwords.** New passwords (sign-up, change, reset, the server command) found in known breaches are
  refused, via Have I Been Pwned with k-anonymity: only the first five characters of the SHA-1 hash leave the
  server. `PWNED_PASSWORDS_CHECK=0` turns it off for offline installs.
- **Sessions** use the `swm.session-token.v1` cookie (HTTP-only, secure in production). Changing a password or
  signing out everywhere ends every other session.
- **Space-entered hosts** (a space's SMTP relay, a self-hosted Mattermost) must resolve to public
  addresses, checked when saved and again when used, so they can't reach the server's own network. Chat
  deliveries never follow redirects.
