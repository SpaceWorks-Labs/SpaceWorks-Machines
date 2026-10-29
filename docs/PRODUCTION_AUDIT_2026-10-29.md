# Production readiness audit — 29 October 2026

## Maintenance API source correction — 30 October

The final clean-source inventory found `app/api/v1/maintenance/logs/route.ts` ignored by the
unanchored `logs/` rule. The previous 980-path archives and production images therefore omitted this
advertised GET/POST endpoint; their passing gates below are historical for that source, not proof of
this endpoint. The rule now ignores only root `/logs/`, and the reviewed route is tracked. POST now
returns the same minimal DTO as GET rather than spreading the domain's private database row. Positive
costs require the creator's current finance permission inside the write transaction; technicians retain
zero-cost and cost-free maintenance access after a role change.

A new completeness regression uses Git's tracked paths, reproducing the omission despite the file
existing in the dirty checkout. It failed before staging the route and passes afterward. The scoped
real PostgreSQL API suite passes **19/19**, including eleven new auth, scope, tenancy, actor/MFA revocation,
validation, atomic audit/finance/webhook, cost authority, pagination and DTO cases. Complete units pass
**689/689 in 101 files**; full lint, TypeScript and changed-script ShellCheck pass. The corrected source has
**981** tracked paths. Actual image installation/encrypted recovery will be repeated and remain pending
for this source. Version stays **0.6.0**; main publication must wait for green gates.

Final evidence updated 30 October 2026. Scope: Space Works Machines, baseline `4278344` on `dev`;
the checkout was clean before work. This is a risk-based source audit and verified local acceptance,
not production certification. No production database, payment account or deployment was used. Existing
private environment files were not read; all runtime accounts, credentials and recipients were fixtures.

## Final 0.6.0 disposition

The requested **0.6.0** application and local clean-stack acceptance gates passed on
`fd14f30d855ab0710fa2d604d9446045c217fb8c`. This final report is a documentation-only follow-up.
The normalized source archive includes **980/980 tracked paths plus `.release`**, SHA-256
`6c53d2cc103337f49bc697ba566827189be8682da579a445bc81f52c7f42bb63`.
The acceptance archive and current tracked source were compared before this report update.

| Final gate | Evidence and result |
| --- | --- |
| Complete units | **688/688**, **101 files**, zero skips, 151.32 seconds, one worker. Native Git Bash was selected explicitly. |
| Current CI | All six checks green on `fd14f30`; Tests run `40957780539`, Security Audit run `40957780578`. Includes full lint/type/build/security, **504 PostgreSQL tests in 33 files**, **19 browser journeys**, and clean production installation/encrypted recovery. |
| Changed financial flows | **12/12 actual PostgreSQL tests in three files**, including tenant-day boundaries, finance, repair payouts, purchases/acquisition and future-write rollback. Helper/action/domain units cover Kolkata, western offsets, DST and impossible dates. |
| Native application builds | Both final Alpine images built from the complete current source through committed installer paths. Backend compilation 113 seconds, TypeScript 101 seconds; frontend compilation 36.8 seconds, TypeScript 36.8 seconds. Static generation, job bundles and frontend dependency boundary passed. No previous application image bypass was used. |
| Installer and private permissions | Actual `scripts/test-vps-install.sh` → `setup.sh --build` passed with PostgreSQL HBA/init, public probe and operator/helper files deliberately owner-only. PostgreSQL stages inputs to its own UID; backend/operator files have correct runtime ownership and readable bytes. No existing user assets were chmodded. |
| Encrypted disaster recovery | Actual committed recovery passed: age-encrypted archive copied outside the installation, original volumes deleted, fresh project and empty volumes, configuration/TLS recovered from the archive, database relationships and private object bytes restored, production MFA helper decrypts restored ciphertext. Schedulers remain paused until readiness succeeds, then resume last. |
| Email before and after restore | Verification, password-reset and magic-link messages each crossed PostgreSQL outbox → Redis/BullMQ → real worker → authenticated STARTTLS capture before and after restore. Delivery occurred once and bearer payload rows were deleted. Worker/beat readiness passed. No external email was sent. |
| Committed production smoke | `ci-compose-smoke.sh` exited zero after the recovery drill; TLS, least-privilege DB role, migrations, Redis, private storage, app readiness, hidden internal jobs and backup/restore passed. |
| Actual final split-image journeys | Separate final backend/frontend images: manager password plus MFA, manual finance and repair-payout gateway writes, tomorrow rejected without writes, tenant-local dates and authenticated CSV passed. Both stored dates equal Kolkata midnight `2026-10-29T18:30:00Z` for 30 October. Frontend has no application credentials and uses an independent action key. |
| Actual final UI evidence | Finance desktop and payout mobile **390 × 844** screenshots visually inspected. Mobile document width **390 px**, no document overflow or overlapping controls; the payout table scrolls inside its container. No browser runtime errors. This is bounded visual evidence, not a complete accessibility/mobile-device matrix. |
| Deployment checks | Exact CI ShellCheck 0.10.0 warning-level checks over **30 shell scripts**, **13 Compose configurations**, Python release helper **6/6**, all five migrations, worker/beat build, frontend catalogue **68 views/116 actions** and dependency boundary passed. No Helm chart exists here. |

Immutable final image identities:

- Backend: `sha256:32c0712e09cbb3eb8c6f2bdf6f8e7a03c4b5dd60719d4d672fd6653f95b51b9f`.
- Frontend: `sha256:0bb18c812d200d75c04161e074c8c9b7482a8fba1d93ad3f8a9861d107b5cb20`.
- Actual deployed edge: `sha256:98aff47f57cf2d97ff0895b13101f9de15616e712fcf97e8b2c6e19f87bbe4b1`.

Independent unsuppressed Trivy scans with the frozen 29 October database report **zero OS/library
findings at every severity** for both final application images. This is advisory evidence, not a universal
zero-vulnerability guarantee. The edge reports **0 critical / 1 high / 2 medium / 1 unknown**, no OS findings:
the unfixed JOSE v3 trio and unmaintained OpenPGP entry. All eight edge RootFS layers exactly match the
reviewed shared image `0956bb7459167ed6f47cc9fbb29e2d3ddb452f7ba1b7313f175a1ebd74c91293`.
Its extracted binary versions/modules, trusted generated-CA HTTPS, explicit HTTP/2 ALPN, proxy headers,
hidden internal routes and stock-module parity passed. Shipped/adapted configs expose no ACME-server or
untrusted JWK handler. Symbols remain present; configuration changes can change exposure. Binary GoDB
results predate the JOSE advisory and do not prove absence. See `docker/caddy/README.md` for exact limits.

October 26 Silo/mc multiarchitecture digests are pinned in the stack and were used in the successful
clean install/recovery. Their raw scans and upstream-source assessment remain retained: Silo's reported
MinIO CSV high attribution has a verified bounded-read backport; raw medium/low/unknown findings are not
suppressed. The entire shared service stack is not claimed to have a zero-finding scan.

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
| High | Fresh-volume recovery started the storage backup scheduler before restoring objects. Its `mc mirror --remove` could mirror an empty bucket over the only recovered object source. Normal restore also left that scheduler running during object recovery. | Fresh recovery starts only persistent data services, then explicitly runs bucket initialization and migration as one-shot jobs. Restore freezes serving and both backup schedulers before taking its safety dump, restores database/files, explicitly reruns migrations, starts only serving processes, checks readiness, then resumes schedulers last. Failure leaves schedulers stopped so the complete source remains available for retry. New-server instructions specify this order; behavioral tests cover migration and readiness failures without resuming schedulers. |
| High advisory; application exploitability not demonstrated | Prisma 6's configuration dependency resolved to `deepmerge-ts` 7.1.5, affected by recursive-object stack exhaustion ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)). Plain JSON does not produce the recursive graph required by the advisory. | Root override pins patched 8.0.2. Both isolated Docker migration CLI and operator installs inherit sanitized security overrides; a regression covers their build definitions. Clean Linux installs, production image builds and actual fresh-volume migrations passed. |
| High advisory; bundled tooling | Unsuppressed Trivy scans of both actual final images found 10 high, 10 medium and one low advisory occurrences each, with zero critical. All high findings were in inherited global npm tooling; Alpine OS and application/isolated Prisma dependencies had no high findings. | Both final runtime stages now remove `/usr/local/lib/node_modules/npm` and the global `npm`/`npx` launchers before switching user. All published roles invoke Node directly, including the isolated Prisma migration CLI and operator clients. Build stages retain their package managers. Final 0.6.0 backend and frontend scans report zero OS/library findings at every severity. Actual Node/Prisma migrations, operator commands, workers, installation and encrypted recovery passed with npm absent. |
| Critical/high advisory; shared edge | The actual official Caddy 2.11.7 image contains vulnerable Alpine Brotli/curl packages, Go 1.26.8 and affected x/net/Go JOSE dependencies. Re-pulling the official tag retained the same image digest. | An independent `docker/caddy/` build preserves standard modules/runtime with Go 1.26.10, x/net 0.62.0, Chi 5.4.0 and Go JOSE v4 4.1.6 under verified module sums, plus Alpine security upgrades. Setup, upgrades and smoke build it locally even with published app images. The final image compiled and passed actual generated-CA HTTPS with explicit HTTP/2, proxy and module-parity checks. Unsuppressed scanning reports 0 critical/1 high/2 medium/1 unknown, with every known fixable finding removed. Unpatched JOSE v3 symbols remain in the binary; shipped/adapted configs expose no ACME-server/JWK handler. The raw findings, GoDB lag and configuration limits remain documented. |
| Medium | Manual status changes or retirement/restoration could return a machine with open downtime to service. | Operational statuses and restoration require downtime to be closed. The existing end-downtime flow closes its window before restoring idle. PostgreSQL tests cover status and retirement bypass attempts. |
| Medium | A source checkout acquired under a private umask can contain owner-only public asset directories/files. The backend copied those assets as root and then served as a different UID, causing Next to exit with `EACCES` while scanning `public/brand`. | Backend public assets now use the same explicit non-root ownership as the frontend. The CI-only installer fixture refuses probe collisions, creates a new owner-only public probe (directory 700/file 600), and checks its non-root UID, permissions and exact bytes inside the running backend. Existing assets are never chmodded. Whole-fixture cleanup removes the probe. The same rule now covers direct operator-tool and MFA-helper copies. Actual 0.6.0 setup and recovery passed with owner-only probe files, explicit runtime UID and byte/read checks. Directory checks require real traversal access after Docker merges directory metadata. Failed runs remain retained. |
| Medium | The installer’s private umask can produce HBA mode 600 and init script mode 700 owned by the installer. PostgreSQL drops to another UID and the directly mounted files caused a real fresh-install `Permission denied` failure. | Its root bootstrap now copies readonly source inputs into PostgreSQL-owned runtime paths with HBA/key mode 600 and init/directory mode 700. Source permissions stay private. The actual PG probe reproduces the old failure and verifies healthy TLS/application-role initialization after the fix. The committed installer forces private input modes only in its temporary fixture and checks runtime access as PostgreSQL; failure traps retain database/Redis/Silo logs before teardown. |
| Medium | Space SMTP settings committed separately from their audit, and logged setting values in legacy metadata. | Settings and field-name-only audit now share one transaction. A forced audit failure proves PostgreSQL rolls the settings back. |
| Medium | A test SMTP send could resolve with a rejected recipient and still mark settings verified. | Verification checks the relay's accepted/rejected recipients before setting `verifiedAt`. Database tests cover rejection and acceptance. |
| Medium | A successful SMTP test could mark a concurrently saved, untested configuration verified. | Verification now conditionally updates the captured settings revision (`updatedAt`), and returns a retest instruction if the saved settings changed while mail was in flight. The PostgreSQL regression saves a changed configuration during the send and proves it remains unverified until separately tested. |
| Medium | Repair payout, purchase and manual finance date inputs silently clamped any future day into now; impossible calendar dates could normalise into another day. Acquisition dates compared UTC midnight against the clock, rejecting the current space day near a timezone boundary. | Strict calendar validation now preserves date-only acquisition storage and compares against the authorised space day. Financial dates resolve through the existing space-local day boundary and retain unchanged domain future guards, so tomorrow is rejected. Finance/payout displays and exports use the space day. Focused helper/action/domain regressions cover Kolkata, western offsets, DST and impossible dates; actual PostgreSQL actions exercise all four write flows and future-write rollback. |
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
| Frontend and split hosting | Reviewed shared loader/action gateway and frontend catalogue boundaries. Backend/frontend typechecks and catalogue drift check pass. Historical 0.5.1 browser suites passed 19 journeys in each layout. Final 0.6.0 CI passed all 19 existing journeys; actual final split images additionally passed the changed finance/payout journeys. Desktop requester and actual-image mobile staff light/dark screenshots were preserved and inspected. |

## Historical checkpoints and failures

Earlier **0.5.1** Linux acceptance passed 663 units/98 files and 502 PostgreSQL tests/32 files.
The complete production **monolith 19/19** and **split 19/19** browser suites passed with zero skips/retries,
covering public catalogue, accounts/verification/MFA, super-admin/invitations, membership/roles/settings,
private files, large job upload/payment/collection, repair, upkeep, APIs and simulated printers. Those full
split results precede the calendar correction; they are historical evidence, supplemented by final 0.6.0
CI's 19 journeys and the actual final split finance/payout checks above. Four actual-image staff queue/job
mobile light/dark captures at 390 px were also inspected during that checkpoint.

Historical failures were fixed and retained rather than counted as passing gates:

- Initial Windows runs encountered host saturation, incorrect Bash selection and Sharp companion-DLL
  tracing; bounded retries and standalone preparation passed. The first partial browser attempt was not
  counted as a journey pass. Complete Linux production browser suites subsequently passed.
- Initial recovery incorrectly selected completed one-shot jobs with Compose `up --wait`. The committed
  harness now waits only for persistent data services, then explicitly runs bucket creation and migration.
- CI `40948766876` exposed private PostgreSQL bootstrap ownership; `40953302232` exposed private direct
  operator-source ownership. Both now pass actual restrictive-input installation and recovery.
- CI `40956066564` passed application/setup behavior but hit an over-specific test expecting directory 700
  after Docker merged it to 755. `fd14f30` checks actual runtime traversal and retains exact file mode 600,
  UID and byte assertions. Its complete CI and independent native installer/recovery passed.
- The first new calendar integration fixture omitted a required supplier; correcting the fixture yielded
  12/12 real PostgreSQL passes. Final units are 688; earlier 687/663 counts are historical.
- The supplemental split harness initially rejected mismatched public/private backend origins, then found
  Docker Desktop host-network loopback unavailable from Windows. The final isolated bridge/shared network
  namespace publishes only loopback fixture ports and passes without application changes.

## Reproduction and retained evidence

Logs, source archives/hashes, image metadata, raw scanner results and screenshots are retained outside
the repository at `../audit-evidence/2026-10-29/machines/`; private fixture credentials are not publication
artifacts. The checked-in reusable contracts are `scripts/test-vps-install.sh`, `test-vps-recovery.sh`,
`test-vps-mailpit.sh`, `ci-compose-smoke.sh`, guarded `docker/ops/` probes and their CI jobs.
CI explicitly installs age. Run destructive acceptance only in its explicitly guarded disposable fixture.

Key final evidence:

- `source-final-060.tar` and `.json`: complete normalized source snapshot and digest.
- `logs/native-060-overall.log`, `fresh-installer-recovery-060.log`, `ci-compose-smoke-060.log` and matching
  `.exit` files: all exit zero; `production-drill-result-060.json` records every recovery proof.
- `logs/final-c235-full-units.log`: 688/101; `logs/calendar-days-integration.log`: affected 12/12.
- `logs/split-finance-060.log` and `artifacts/split-finance-060/{result.json,image-proof.json}`:
  final immutable-image split journey/DB/credential proofs. Screens: `finance-desktop.png` and
  `payouts-mobile-390.png`; authenticated CSV is retained beside them.
- Historical complete browser artifacts: `artifacts/browser-monolith/`, `browser-split/`,
  `mobile-browser/`, with original success/failure logs preserved separately.
- Sibling `../image-security/machines-060-{backend,frontend}-final/` and
  `../image-security/shared-caddy-machines-060-final/`: unsuppressed exact-ID scans and layer equivalence.

Every disposable Machines runtime fixture was stopped/removed after its check. Audit-owned source/cache
volumes and image tags remain recorded for coordinated final cleanup. The user subsequently expanded
cleanup to resources belonging to all four repositories, including pre-existing generated caches once
identity is established. Database/object/user data must first be preserved outside Docker. Source checkouts
and evidence remain; shared BuildKit/cache belongs to the coordinator. No global prune or unrelated
resource deletion is permitted.

## Remaining external boundaries

The requested local clean-stack installation and encrypted recovery are complete. These separate checks
were not exercised and should be matched to the intended deployment:

1. Target VM firewall/systemd, public DNS/ACME TLS, published release acquisition and host update/rollback.
2. Actual Stripe/Razorpay test accounts, external signed webhook settlement and real provider refunds.
   Database and browser fixtures cover internal idempotency/refund/ledger behavior.
3. Intended SMTP/chat providers, SPF/DKIM/DMARC, external inbox deliverability and real alert routing.
   Captured STARTTLS mail proves the application transport and workers only.
4. Broader assistive technology, browsers and mobile devices; physical printer adapters. Only manual and
   simulated printer adapters are supported; unavailable hardware adapters remain labelled “Coming soon”.
5. Release image publication, branch protection/CODEOWNERS and the target host's secrets, monitoring,
   backups and least-privilege policies.

The user authorized feature PRs into `dev`, green CI before merge, then `dev` → `main` PRs with green CI
before merge, followed by removal of other branches. The coordinator owns those publication actions;
this report records tested source and does not assert future merges or production deployment occurred.
