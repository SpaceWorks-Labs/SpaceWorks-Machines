# Production readiness audit — 29 October 2026

Scope: Space Works Machines only, baseline `4278344` on `dev`; checkout was clean before this work.
This is a risk-based source audit and local verification, not production certification. No production
database, payment account, deployment or GitHub write was used. Existing private environment files were
not read. All runtime data, credentials and mail recipients used here are disposable fixtures.

The requested release version is **0.6.0**. The complete application behavior gates below ran on
the earlier **0.5.1** source, followed by packaging/version-only corrections. Final 0.6.0 native
installation and encrypted recovery are pending; they are not represented as completed here. Version/lock,
Docker context and recovery guard regressions passed 11/11 after the update; the catalog and installer
Bash syntax/ShellCheck passed.

The first 0.6.0 PR CI run (`40948766876`) passed application units, type/build/security,
502 PostgreSQL integration tests and browser checks, but its initial clean installation failed
before backup/recovery: PostgreSQL could not read installer-owned private bootstrap inputs.
The corrected staging passed an isolated actual PostgreSQL before/after reproduction,
18 focused regressions, warning-level ShellCheck and all 13 Compose configurations.
The complete corrected 0.6.0 installation/recovery and CI rerun remain pending.

## Findings fixed

| Severity | Finding and impact | Change and regression evidence |
| --- | --- | --- |
| High | Direct private machine file URLs checked staff role but bypassed current MFA and machine type assignments. A type manager knowing another type's file URL could retrieve its private manual or upkeep evidence. | `lib/machines/fileAccess.ts` now checks current staff MFA, capability, space state and assigned type for private photos, documents, maintenance, warranty and fault files. Database tests cover MFA removal and immediate type-assignment revocation across all five file kinds. Public assets retain their explicit public policy. |
| High | Staff/API status changes and retirement could release or retire a machine with a running or paused job, leaving the job, reservations and machine status inconsistent. A stale printer poll could also overwrite a newly started job's machine state. | The common machine mutation holds the machine row lock and rejects another active job. Only the owning job transition carries its job context; retirement refuses busy machines. Tests cover running/paused states, cancellation, completion and a start-versus-offline race. |
| High | Tenant-selected SMTP, Mattermost and outbound webhook hosts were checked before a separate transport DNS lookup, allowing DNS rebinding between validation and connection. | Public DNS answers are resolved with a timeout and pinned to the transport. SMTP preserves original TLS server name; custom HTTP keeps hostname verification, disallows redirects and limits time. Reserved/transition IPv6 and alternate mapped-IP representations are checked. Tests exercise mixed public/private answers, mapped/expanded addresses, a rebinding answer change and a real pinned local HTTP request. |
| High | Source Docker builds did not exclude `tls/` or `.spaceworks-*` files. Rebuilding an existing installation could copy private service keys and installer answers into builder layers/cache. | `.dockerignore` excludes both paths. Focused tests require these exclusions and prohibit secret re-inclusion. An actual Docker-context probe also passed during installation acceptance. |
| High | Database restore streamed gzip output directly into PostgreSQL. A truncated archive can emit complete SQL before gzip rejects its missing checksum, allowing destructive schema replacement to commit from an invalid backup. | Restore now completes decompression into a private temporary file before invoking PostgreSQL, removes that file on exit, and uses `psql -X` with the existing error-stopping transaction and `swmach`/`swmach_app` grants. Behavioral tests prove a valid archive is applied and a missing-footer archive never calls PostgreSQL. |
| High | The scheduled backup's conditional function call disabled shell `errexit`, allowing failed/empty dumps or compression/rename errors to report success and publish invalid archives. Retention also ran after failed backups, risking removal of the last good recovery copy during an outage. | Every dump, size, compression and atomic rename step now checks failure explicitly and removes partial files. Retention runs only after success. Behavioral tests invoke the real function in conditional context and prove failed stages publish nothing; a failed schedule never calls retention. |
| High | Restore failure handling restarted serving processes even after the database had committed but object restoration or subsequent stack readiness failed, exposing mismatched data/files or a partly started stack. | The operator script tracks database commit. Precommit failure restarts only serving processes while backup schedulers remain frozen; later failure explicitly stops serving services and schedulers and leaves the site offline for recovery. Behavioral phase tests cover transaction failure, object-copy failure, partial startup/readiness failure and full success. |
| High | Fresh-volume recovery started the storage backup scheduler before restoring objects. Its `mc mirror --remove` could mirror an empty bucket over the only recovered object source. Normal restore also left that scheduler running during object recovery. | Fresh recovery starts only data services and migration. Restore freezes serving and both backup schedulers before taking its safety dump, restores database/files, explicitly reruns migrations, starts only serving processes, checks readiness, then resumes schedulers last. Failure leaves schedulers stopped so the complete source remains available for retry. New-server instructions specify this order; behavioral tests cover migration and readiness failures without resuming schedulers. |
| High advisory; application exploitability not demonstrated | Prisma 6's configuration dependency resolved to `deepmerge-ts` 7.1.5, affected by recursive-object stack exhaustion ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)). Plain JSON does not produce the recursive graph required by the advisory. | Root override pins patched 8.0.2. Both isolated Docker migration CLI and operator installs inherit sanitized security overrides; a regression covers their build definitions. Clean Linux installs, production image builds and actual fresh-volume migrations passed. |
| High advisory; bundled tooling | Unsuppressed Trivy scans of both actual final images found 10 high, 10 medium and one low advisory occurrences each, with zero critical. All high findings were in inherited global npm tooling; Alpine OS and application/isolated Prisma dependencies had no high findings. | Both final runtime stages now remove `/usr/local/lib/node_modules/npm` and the global `npm`/`npx` launchers before switching user. All published roles invoke Node directly, including the isolated Prisma migration CLI and operator clients. Build stages retain their package managers. The first npm-free 0.5.1 backend scan reports zero findings and direct Node/Prisma CLI checks passed, but clean startup exposed the separate asset ownership defect below. Final 0.6.0 image installation/recovery and rescanning remain pending; the prior full runtime evidence refers to the original images. |
| Critical/high advisory; shared edge | The actual official Caddy 2.11.7 image contains vulnerable Alpine Brotli/curl packages, Go 1.26.8 and affected x/net/Go JOSE dependencies. Re-pulling the official tag retained the same image digest. | An independent `docker/caddy/` build preserves standard modules/runtime with Go 1.26.10, x/net 0.62.0, Chi 5.4.0 and Go JOSE v4 4.1.6 under verified module sums, plus Alpine security upgrades. Setup, upgrades and smoke build it locally even with published app images. The final image compiled and passed actual generated-CA HTTPS with explicit HTTP/2, proxy and module-parity checks. Unsuppressed scanning reports 0 critical/1 high/2 medium/1 unknown, with every known fixable finding removed. Unpatched JOSE v3 symbols remain in the binary; shipped/adapted configs expose no ACME-server/JWK handler. The raw findings, GoDB lag and configuration limits remain documented. |
| Medium | Manual status changes or retirement/restoration could return a machine with open downtime to service. | Operational statuses and restoration require downtime to be closed. The existing end-downtime flow closes its window before restoring idle. PostgreSQL tests cover status and retirement bypass attempts. |
| Medium | A source checkout acquired under a private umask can contain owner-only public asset directories/files. The backend copied those assets as root and then served as a different UID, causing Next to exit with `EACCES` while scanning `public/brand`. | Backend public assets now use the same explicit non-root ownership as the frontend. The CI-only installer fixture refuses probe collisions, creates a new owner-only public probe (directory 700/file 600), and checks its non-root UID, permissions and exact bytes inside the running backend. Existing assets are never chmodded. Whole-fixture cleanup removes the probe. The failed native install and diagnostic logs are retained; final corrected-image verification is pending. |
| Medium | The installer’s private umask can produce HBA mode 600 and init script mode 700 owned by the installer. PostgreSQL drops to another UID and the directly mounted files caused a real fresh-install `Permission denied` failure. | Its root bootstrap now copies readonly source inputs into PostgreSQL-owned runtime paths with HBA/key mode 600 and init/directory mode 700. Source permissions stay private. The actual PG probe reproduces the old failure and verifies healthy TLS/application-role initialization after the fix. The committed installer forces private input modes only in its temporary fixture and checks runtime access as PostgreSQL; failure traps retain database/Redis/Silo logs before teardown. |
| Medium | Space SMTP settings committed separately from their audit, and logged setting values in legacy metadata. | Settings and field-name-only audit now share one transaction. A forced audit failure proves PostgreSQL rolls the settings back. |
| Medium | A test SMTP send could resolve with a rejected recipient and still mark settings verified. | Verification checks the relay's accepted/rejected recipients before setting `verifiedAt`. Database tests cover rejection and acceptance. |
| Medium | A successful SMTP test could mark a concurrently saved, untested configuration verified. | Verification now conditionally updates the captured settings revision (`updatedAt`), and returns a retest instruction if the saved settings changed while mail was in flight. The PostgreSQL regression saves a changed configuration during the send and proves it remains unverified until separately tested. |
| Medium | The supported plain-HTTP installer could start normally, but verification, reset and magic-link outbox handlers rejected all HTTP links in production and permanently deleted their messages. | Production HTTP capability URLs now require the explicit HTTP/CI opt-in and exactly the configured application origin. Embedded credentials and foreign origins are refused. Policy units and actual PostgreSQL claim/send/delete regressions cover all three kinds and repeated delivery. The source installer/recovery test also exercises these kinds through real workers and local authenticated STARTTLS capture. |
| Medium | A confirmed single-server setup could retain a previous split website's `SITE_ORIGIN`, producing links and authentication origins for the wrong host. | The setup writer applies `SITE_ORIGIN` only to split mode. Real writer regressions cover retained split origins, valid split host separation and single HTTP hosts. The fixture now includes its published HTTP port in its public origin, and invalid fixture ports fail before host tools run. Existing-install migration instructions explain that setup preserves `.env` and list the origins to update together. |
| Medium | Local compose supplied only PostgreSQL and Redis, omitted real file/email services, and published data-service ports on all interfaces. Manual web startup with Redis also required undocumented worker/beat processes to deliver notifications. | Local compose now provides private Silo with a scoped app identity, Mailpit and persistent Redis, all bound to loopback. `npm run dev:local` starts services/migrations and supervises web, worker and beat with separate health ports and process-tree shutdown. The existing production installer remains the server path. |
| Medium | Next's Windows standalone trace retained Sharp's native `.node` file but omitted both companion libvips DLLs, so private routes failed when loading the image-validation module even though the production build passed. | `scripts/prepare-standalone.mjs` now copies installed `@img` runtime packages in full. The prepared Windows standalone `sharp` module was successfully required. Both complete Linux production browser layouts passed afterward; Windows browser acceptance was not repeated. |
| Medium | A Linux build with a two-CPU Docker quota still selected 23 page-data workers from the host CPU count. Its page-data phase stalled while shared Docker resources were exhausted. | Shared Next configuration now caps build workers at two; the separate frontend inherits the same limit. The installed Next static-generation documentation and configuration types/defaults were checked before this change. Completed monolith/split Ubuntu builds and both Alpine production image builds passed with the cap. |

## Coverage

| Area | Source and verification |
| --- | --- |
| Accounts and sessions | Reviewed credentials/magic-link login, session-version revocation, MFA/recovery, login devices and rate limits in `lib/auth.ts`, `lib/permissions.ts`, and associated helpers/tests. Existing unit coverage exercised account and auth actions; private-file MFA bypass was fixed. |
| Tenancy and roles | Reviewed capability gates, tenant identifiers, type-manager scope, API key creator capability checks, public/private machine visibility and file resolvers. Current database regression run includes direct-file assignment revocation and API/webhook isolation. |
| Machines and jobs | Reviewed intake, submission, approval, scheduling/capacity locks, start/pause/resume/finish/cancel/reprint, usage recording and consumable reservation/reconciliation. Real PostgreSQL tests cover ordering of locks, concurrent starts/completions, maintenance and public catalogue privacy. |
| Money | Reviewed checkout attempts, gateway idempotency/reconciliation, webhook signature/deduplication, refunds/caps, offline confirmation and append-only finance posting. The final complete PostgreSQL matrix passed; actual third-party test-mode settlement remains an operator gate. |
| Upkeep, repair and purchasing | Reviewed downtime, maintenance records/sweeps, fault and repair requests, bearer repair links, technician acceptance locks, repair fix/payouts and to-buy flow. Targeted upkeep tests pass; private upkeep attachment scope was fixed. |
| HTTP, files and integrations | Reviewed API route wrapper, CSRF/same-origin upload paths, capped gateway webhooks, private storage/download access, outbound signing/retries and manual/simulated printer boundaries. Fixed shared outbound DNS and file access gaps. |
| Background delivery | Reviewed SQL outbox claims/retry/deletion, BullMQ registry/queues/worker/beat and readiness. Real local worker, beat, Redis, SMTP capture and S3 tests passed as described below. |
| Deployment and installation | Read installer/setup, production compose, Dockerfile, entry points, least-privilege/TLS setup and operator docs. Compared the Events production stack: dedicated worker/beat, PostgreSQL, Redis and Silo remain the architecture. Actual clean-stack installation and encrypted restore into new empty volumes passed, including private objects, recovered configuration/keys and SMTP before/after restore. VM/public release boundaries remain below. |
| Frontend and split hosting | Reviewed shared loader/action gateway and frontend catalogue boundaries. Backend/frontend typechecks and catalogue drift check pass. All 19 browser journeys passed separately in monolith and split layouts. Desktop requester and actual-image mobile staff light/dark screenshots were preserved and inspected. |

## Initial Windows verification (superseded by complete Linux gates below)

Initial host checks used Windows PowerShell, Node `v24.21.0`, npm `11.19.0`, Docker `29.9.1`.
Additional complete Linux suites below used the declared Node 22 runtime in a disposable container.

| Check | Actual result |
| --- | --- |
| Unit suite | **611/611 passed**, 88 files, `npm run test:unit -- --maxWorkers=1 --reporter=dot --testTimeout=30000`; Git Bash was put first on PATH for installer argument tests. This run included new network regressions, before the final private-file/SMTP action changes. |
| Latest private-file/network units | **35/35 passed** across `public-machine-files`, `public-host` and `public-post`. |
| Local supervisor regressions | **11/11 passed**, covering startup composition, distinct ports, disabling in-process polling, graceful sibling shutdown, unexpected exits and remote database/migration/Redis/S3/SMTP refusal. The shared supervisor is aligned with the reviewed Inventory implementation. |
| Build context and shared MFA primitives | **6/6 passed**, including Docker secret exclusions, migration/operator dependency overrides and existing MFA authenticated encryption. The recovery probe imports the same encryption functions as `lib/mfa.ts`; existing ciphertext format is retained. Backend `tsc --noEmit` and focused ESLint passed after this extraction. |
| PostgreSQL affected-flow suite | **61/61 passed**, 9 files: `machine-job-safety`, `machine-file-security`, `space-email-settings`, `jobs-transitions`, `jobs-concurrency`, `machines-public`, `integrations`, `upkeep`, `notifications`. Uses disposable PostgreSQL + Redis, fixture keys and one Vitest worker. |
| Latest file/SMTP database rerun | **4/4 passed**, including all five private file kinds, current MFA/type scope, audit rollback and SMTP recipient verification. |
| Backend typecheck | Passed after the domain/network/file/SMTP changes. |
| Lint | Passed with no warnings after removing the three pre-existing unused bindings. |
| Frontend workspace typecheck | Passed. |
| Frontend catalogue | Passed: **68 views, 116 actions**, `npm run frontend:catalog -- --check`. |
| Worker/beat build | Passed, `npm run build:jobs`. |
| Migration deploy | All **5 migrations** applied successfully to each of two fresh disposable PostgreSQL databases. |
| Shell scripts | Passed shellcheck warning level over `install.sh`, `setup.sh`, `scripts/*.sh`, `deploy/*.sh`, including the new local bucket initializer. |
| Release helper tests | **6/6 passed**, `python -m unittest discover -s tests/scripts -p 'test_*.py' -v`. |
| Production dependency audit | `npm audit --omit=dev --json`: **0 vulnerabilities** reported at audit time. This is registry advisory evidence, not a proof that dependencies have no defects. |
| Whitespace | `git diff --check` passed. |
| Local launcher | Syntax/help passed; shared supervisor tests **11/11 passed**. `dev:local` provisions services before invoking that supervisor; `dev:stack` uses already-provisioned services. Worker/beat support graceful IPC shutdown and local health binds loopback. Full supervised web startup/shutdown still requires runtime confirmation. |
| Next production build | **Passed**, `npm run build` against disposable fixture environment: compilation 22.3 seconds, TypeScript 30.7 seconds, all 21 static pages generated, standalone output produced. |
| Standalone native preparation | Passed: companion DLLs are present and `require('./.next/standalone/node_modules/sharp')` succeeds. |
| Browser journeys | **Attempted, no clean journey gate obtained.** Eleven representative tests were selected on an isolated seeded database with real local Silo/Redis. The first startup rejected blank optional SMTP credential variables in the fixture; the rerun started successfully but exposed the Sharp DLL tracing issue above. Browser execution was then stopped at the coordinator's request because the shared host exhausted RAM. A complete retry after the packaging fix remains required. |

The first unbounded unit run hit import timeouts and Windows selected the wrong Bash. A bounded rerun
with Git Bash and a 30-second test ceiling passed. The first full integration attempts were interrupted:
an invalid `memory://` setup caused Redis retry delays, then the saturated shared Docker host temporarily
refused a Prisma connection. Those attempts are **not** counted as a passing full integration gate. The
clean affected-flow run used real Redis plus 30-second connect/60-second pool timeouts and fixture keys.

## Complete Linux quality acceptance

An independently captured current-source `0.5.1` snapshot ran in `spaceworks-acceptance:20261029`
(Playwright Ubuntu Noble base, official Node **22.23.4**, npm **10.9.9**, PostgreSQL 16, Redis 7,
pinned Silo and Mailpit). No user's `.env`, Git credentials or original `node_modules` were copied.
Source was copied into a new named volume; a disposable Git index allowed repository file checks.
The compose project is `swm-linux-acceptance-20261029`; no service port is published to the host.

| Gate | Actual Linux result |
| --- | --- |
| Clean install and advisory audit | `npm ci --no-audit --no-fund` passed, 560 packages; `npm audit --audit-level=high` reported **zero vulnerabilities**, including tooling. Prisma generate/validate passed with the patched dependency override. |
| Lint and typechecks | Backend lint, `next typegen && tsc --noEmit`, generated frontend preparation and frontend `tsc --noEmit` all passed. |
| Complete units | Latest complete run **663/663 passed**, **98 files**, **33.74 seconds**, one worker, 30-second timeout, no skips; includes origin corrections, disposable recovery guards, HTTP capability policy, corrupt-backup refusal, scheduled-backup failures/retention, restore failure phases, one-shot bootstrap ordering, local edge selection and conditional-caller image failure propagation. Final full lint passed. |
| Complete PostgreSQL integration | Final rerun **502/502 passed**, **32 files**, **231.27 seconds**, one worker, 60-second test/hook limits, dedicated database/Redis and fixture keys. Includes payment/refund/finance, tenant permissions, transitions/concurrency, repairs, immutable ledgers, schema/lifecycle, HTTP outbox and concurrent SMTP verification. The earlier full run passed 499 cases before the three added SQL regressions. |
| Latest affected PostgreSQL rerun | **12/12 passed**, **3 files**, after the SMTP revision guard: `outbox-http-install` (all three message kinds, bearer deletion and foreign-origin refusal), notifications/magic links, and SMTP settings including a save during in-flight test delivery. Three newly added SQL cases are additional to the earlier complete 499-case run. |
| Final backend typecheck | `tsc --noEmit` **passed** on the final SMTP/operator regression source with a 2 GiB JavaScript heap. Earlier 512/768 MiB caps exhausted the heap without completing; those resource-limited attempts are not counted as passes. A final focused Linux restore-phase rerun also passed **6/6** after narrowing the failure-code test literal types. |
| Deployment and generated code | All five migrations, worker/beat build and frontend catalogue check passed. All **13** bundled/cloud/layer/storage/source-build Compose configurations resolved through the actual wrapper. No Helm chart exists in this repository. |
| Script checks | Python release helper **6/6 passed**. All **30** project shell scripts passed exact CI ShellCheck **0.10.0** warning level after the final backup/restore/bootstrap corrections, in a disposable, network-disabled container capped at 256 MiB. Actual image and committed compose smoke also passed. |
| Corrupt-backup regression | **2/2 passed** on Linux `/bin/sh` and Windows/Git Bash: complete gzip reaches one transaction with role grants; a gzip missing its checksum/footer never invokes PostgreSQL. Focused ESLint passed. The Linux unit container had no network or services and was capped at 480 MiB. |
| Supplemental origin/recovery review | **10/10 passed** on Windows/Git Bash: real setup-writer origin regressions plus destructive recovery guards, including invalid-port refusal. Focused ESLint and `git diff --check` passed. The actual subsequent Linux recovery ran new authenticated STARTTLS capture containers before and after restoring into empty volumes, using the restored SMTP certificate/key. |
| Linux monolith production build | Latest final-source run **passed**: compilation **25.1 seconds**, full TypeScript **10.2 seconds**, all **21/21** static pages generated with two workers in 259 ms, standalone preparation succeeded. Earlier attempts found a missing test `NODE_ENV` and then stalled with 23 page workers during Docker exhaustion; those issues were corrected before this completed run. |
| Complete monolith browser suite | **19/19 passed** in **4.6 minutes**, Chromium, one worker, **zero skips and zero retries**, using the standalone production server with disposable PostgreSQL, Redis and private Silo. Executed all existing public, account signup/verification/MFA, super-admin/invitation, membership, staff-role/settings, published machine/photo, large job-file/payment/collection, repair, upkeep and API/simulated-printer journeys. Successful requester light/dark screenshots are preserved outside the repository. This verifies browser behavior; external payment-provider transactions and physical printer hardware remain separate boundaries. |
| Complete split builds/browser suite | **19/19 passed** in **5.1 minutes**, Chromium, one worker, **zero skips and zero retries**. Backend compile **23.1 seconds**, TypeScript **12.0 seconds**; frontend compile **13.2 seconds**, TypeScript **26.6 seconds**; both generated **21/21** static pages with two workers. Separate action keys and credential-stripped frontend environment were used. Frontend trace checks found no database engine, mail, Redis or storage clients. Successful light/dark requester screenshots are preserved separately. These browser runs preceded the final operator backup/restore and SMTP revision-guard corrections, which have dedicated regressions. |
| Actual production Docker images | Backend and frontend Alpine images built successfully from the final application source through committed installer/build paths. Backend compilation **19.0 seconds**, TypeScript **50.0 seconds**; frontend compilation **15.0 seconds**, TypeScript **32.3 seconds**; both generated **21/21** static pages. Worker/beat bundles, isolated migration CLI security overrides and frontend trace boundary passed. A real context probe verified private TLS/answer/environment files were excluded. |
| Clean-stack installation and encrypted recovery | **Passed**, committed `test-vps-install.sh` and `test-vps-recovery.sh`: actual `setup.sh --build`, TLS PostgreSQL/Redis, least-privilege runtime DB role, private Silo, worker/beat/Caddy; age-encrypted off-install archive, deleted original volumes, new project with empty volumes, exact recovered configuration/TLS, database relationships, private object bytes, production MFA-key decrypt, readiness and scheduler-safe recovery. Actual verify/reset/magic mail crossed Redis and real workers into authenticated STARTTLS capture **before and after** restore, exactly once, with bearer payload deletion. |
| Committed production compose smoke | **Passed** after recovery, using the built images and an independently guarded project; `ci-compose-smoke.sh` exited zero. |
| Representative mobile UI on actual image | Real manager password and MFA sign-in, queue and job detail at **390 × 844**, light/dark: **four screenshots captured and visually inspected**, all document/body widths exactly **390 px**, no horizontal overflow or overlapping controls. Theme switching used the mobile navigation/account menu. This supplements the complete desktop browser suites; it is not a full mobile-browser or assistive-technology matrix. |

The first full Linux unit run had 624 passes and one stale version assertion requiring `0.5.0`.
The test now checks current package/changelog consistency while preserving the historical first release
`0.5.0`; the complete rerun passed. Every quality command recorded exit zero. The initial orchestration
shell itself later exited one because its bind-mounted script was edited during execution, shifting a
Bash read offset. The harness now freezes a script copy before execution; its subsequent deployment
phase completed with exit zero. This was a harness failure after successful product checks.

Reproducible harness, source manifest/hashes, fixture environment and command logs are outside the
repository at `../audit-evidence/2026-10-29/machines/`. Fixture credentials there are private test artifacts.
The reusable contracts are `scripts/test-vps-install.sh`, `test-vps-recovery.sh` and `test-vps-mailpit.sh`,
with guarded probes in `docker/ops/`; CI explicitly installs age before running installation/recovery.
The first real image builds and installation passed, but recovery initially selected successful one-shot
jobs in Compose `up --wait`, which rejects their exited state. The committed helper and new-host docs
now start only persistent data services with `--wait`, then run bucket initialization and migration
explicitly. The subsequent successful installer/recovery retry reused the already-built images only
after verifying their exact IDs and the unchanged set and hashes of all **770** application/deployment
inputs. Only host acceptance helpers/docs/tests changed between attempts; no application build was skipped
without that guard. Both the initial failure log and complete successful logs remain in the evidence folder.

Key logs: `logs/final-units-edge.log` (663), `logs/final-lint-edge.log`, `logs/final-integration.log` (502),
`logs/fresh-installer-recovery.log`, `logs/ci-compose-smoke.log`, `logs/production-drill-result.json`
and `logs/mobile-browser.log`. Image IDs are in `logs/image-input-proof.json`; source-input digest:
`d128d711a843a3de7ea21d2b5954f9be633e2e95784ca1155dcad2baeaaf89be`.
Screenshots are in `artifacts/browser-monolith/`, `artifacts/browser-split/` and
`artifacts/mobile-browser/`; the latter includes `metrics.json` and staff queue/job light/dark captures.

## Real local service and notification evidence

An isolated compose project `swm-production-audit-20261029` started PostgreSQL, Redis, Silo and Mailpit with
`docker compose ... up -d --wait`; the bucket initializer exited successfully. Service ports were overridden
to unused loopback ports. Worker/beat used a second freshly migrated database, separate from the integration
database, and a dedicated BullMQ prefix. Their verification showed:

- Worker and beat health endpoints both answered 200 on separate ports.
- All **7 registered BullMQ schedules** were present across the three queues.
- A real SQL outbox verification email was claimed through Redis by the worker and captured by local Mailpit.
- The email's bearer-capability payload row was deleted after successful delivery.
- The scoped Silo application identity successfully put, read and deleted an object.
- Anonymous GET of that same object returned **403**.

No external message was sent. This verifies local SMTP delivery to a capture service, not external inbox
deliverability. The ignored probe files are `tmp/audit-compose-ports.yml` and `tmp/audit-runtime-probe.mjs`.
The production stack continues to use TLS, generated credentials and separate backend/worker/beat roles.
The audit's app/worker/beat processes were stopped and its disposable containers and volumes removed
after verification to release shared-host resources. No unrelated Docker project was changed.

After final edge test-fixture portability changes, all four affected native Bash suites passed
20/20 tests. Full TypeScript checking and focused ESLint passed again; explicit child environments
include "NODE_ENV=test" and Windows selects installed Git Bash rather than an unavailable WSL shell.

The final shared patched edge image "0956bb7459167ed6f47cc9fbb29e2d3ddb452f7ba1b7313f175a1ebd74c91293"
passed extracted-binary version checks and trusted generated-CA HTTPS with explicit HTTP/2 negotiation.
Proxy health, header sanitation, hidden internal jobs, disabled public ACME-server routing and unchanged
standard modules passed. Independent unsuppressed scanning retains 0 critical, 1 high, 2 medium and
1 unknown findings, all unpatched JOSE v3 or unmaintained OpenPGP. The configured-path limits are in
"docker/caddy/README.md"; binary GoDB results predate the JOSE advisory and do not prove its absence.
First-candidate and final raw artifacts are both retained. An initial smoke raced certificate readiness;
its failed log is preserved, and the bounded trusted-TLS readiness retry passed.

## Release gates still required

1. Broaden mobile-browser and assistive-technology coverage as appropriate. Saved desktop requester
   and mobile staff screenshots were inspected; final units, full PostgreSQL, typecheck and shell checks
   pass, and all 19 existing browser journeys passed in both layouts without skips/retries.
2. Verify the target VM's firewall, systemd, public DNS/TLS and update/rollback. The requested local
   clean-stack installation and encrypted recovery into new empty volumes are complete; no remote
   target, public release acquisition or public TLS issuance was exercised.
3. Use actual Stripe and Razorpay test accounts to confirm paid jobs, refunds and repeated real signed
   webhooks each post exactly one ledger movement. No provider account was available in this audit.
4. Validate the intended real SMTP/chat providers, domain authentication, external deliverability and alerts.
   Mailpit proves transport and worker routing only.
5. Verify release image publication, branch protection/CODEOWNERS and the target host's TLS, secrets,
   backups, monitoring and least-privilege policies.
6. Keep real printer adapters labelled “Coming soon” until implemented and tested on the actual hardware;
   only manual/simulated adapters are currently supported.
7. Rebuild both final runtime layers after removing inherited global npm, repeat actual installation and
   recovery, and record unsuppressed image rescans. Initial scan artifacts are outside the repository at
   `../audit-evidence/2026-10-29/image-security/machines-{backend,frontend}/`.
8. Complete renewed clean-stack installation/recovery using the verified patched Caddy image with
   the digest-pinned October 26 Silo/mc releases. Retain exact residual advisory assessments and raw scans.

No push, merge, deployment, production database change or production certification occurred in this audit.
