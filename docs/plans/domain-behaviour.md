# Space Works Machines: domain behaviour

Authoritative behaviour for phases 2–5. The data model is `prisma/schema.prisma` (domain section). The
Django source survey is `docs/plans/source-survey.md`; where this file differs, this file wins (it fixes
the source's gaps on purpose).

Global rules: every row carries `spaceId`; every read and write resolves the space server-side and
checks a capability from `lib/permissionRoles.ts`; foreign rows return 404. Every mutation writes an
`AuditEvent` (`<area>.<verb>`, metadata without secrets or PII bodies). Notifications, webhooks, chat
alerts and gateway calls never fail a state change: enqueue them after commit (outbox / BullMQ). Money
is integer minor units; quantities are Decimal(14,3). Nothing is hardcoded that a manager might want
to change: it is a setting with a sensible default, edited in Space settings or Machine settings
(machine managers; machine type managers for their own types), and every settings change is audited with before/after values.

## 1. Machine types and machines (phase 2)

- **Presets** (`lib/machines/presets.ts`): fdm_printer "3D printer (FDM)", resin_printer "3D printer
  (resin)", laser_cutter, cnc_router, cnc_mill, vinyl_cutter, pcb_mill "PCB mill", soldering_station,
  other. Each preset defines icon, metering unit, consumable unit, spec fields, request fields, file
  policy, materials, colours and queue defaults. Examples:
  - FDM: specs build volume (dimensions mm), nozzle sizes (multiselect mm 0.2/0.4/0.6/0.8), max nozzle
    and bed temperature (°C), heated bed, enclosure, multi-material units (number), firmware (select:
    Marlin, Klipper, Bambu, Prusa, other). Request fields: material, colour, quantity, layer height
    (select), infill % (number), supports (boolean), notes. Files: stl, 3mf, obj, step, stp, gcode,
    gco, bgcode; 100 MB; max 10 files; required. Metering MINUTES, consumable GRAMS. Materials PLA,
    PETG, ABS, ASA, TPU, Nylon; colours Black, White, Grey, Red, Blue, Green, Yellow, Orange, Clear.
  - Resin: build volume, XY resolution (µm), layer height range; consumable MILLILITERS; files stl,
    3mf, obj, ctb, sl1, sl1s; materials Standard, Tough, Flexible, Castable, Water-washable.
  - Laser: bed size (dimensions mm), power (W), laser kind (select CO2, diode, fibre), max material
    thickness (mm), rotary (boolean), air assist (boolean). Request fields material, thickness (mm),
    operation (multiselect cut/engrave/score). Files svg, dxf, pdf, ai, eps, png, jpg, lbrn, lbrn2;
    50 MB. Metering MINUTES, consumable SHEETS. Materials Plywood, MDF, Acrylic, Cardboard, Leather,
    Paper, Fabric.
  - CNC router/mill: work area (dimensions), spindle power (W), max RPM, axes (select 3/4/5),
    collet sizes; files dxf, svg, step, stp, stl, nc, gcode, tap, crv; MINUTES; SHEETS.
  - Vinyl cutter: cutting width (mm), max force (g); files svg, dxf, pdf, eps, studio3;
    MILLIMETERS; materials Vinyl, Heat transfer vinyl, Paper, Stencil film.
  - PCB mill: work area, min trace width (mm), tool sizes; files gbr, gerber, drl, zip, nc, gcode.
  - Soldering station: temperature range (°C), power (W), station kind (select: iron, hot air,
    rework, reflow oven); files optional (pdf, png, jpg); metering MINUTES; no consumables.
  - Other: empty fields, MINUTES, documents policy.
- New spaces get every preset copied into `MachineType` (in the space-creation transaction). Machine
  managers edit any type (name, icon, description, spec fields, request fields, file policy,
  materials, colours, metering/consumable unit, queue rules), archive it, or create custom types from
  scratch or by duplicating a preset. Field-definition JSON is validated by Zod (`lib/machines/fields.ts`):
  keys are slugs, unique; kinds number|text|select|multiselect|boolean|dimensions|material|colour;
  `public` marks specs shown on public pages. Changing a type's fields never invalidates stored
  machine specs: unknown keys are kept but hidden, missing required values only warn.
- **Machines** belong to one type (type immutable after create). Status IDLE, RUNNING, PAUSED,
  RESERVED, MAINTENANCE, OFFLINE; retire/unretire (retired = `retiredAt`, status OFFLINE, hidden
  from queues and public pages). Status changes are audited and emit `machine.status_changed`.
  Photos: up to 8, jpeg/png/webp ≤ 10 MB, validated, re-encoded (strip metadata) like the platform's
  image pipeline, stored privately and served through the app's upload route. Documents: manual, SOP,
  safety, datasheet (pdf/images/txt ≤ 20 MB), optionally public.
- **Public pages**: `/s/[spaceSlug]/machines` (grid grouped by type, status pill with a word, photo,
  public specs) and `/s/[spaceSlug]/machines/[machineSlug]` (photos, public specs, public documents,
  "Request a job" when eligible, "Report a problem" for signed-in members). Only `isPublic`,
  non-retired machines of an ACTIVE, visible space. Never show notes, costs, serials or meters.
- **Consumable pools**: create (material, colour + hex swatch, brand, lot, unit, initial quantity, low
  threshold, cost per unit, bind to machine | type | shared, public toggle), restock (+), correction
  (signed, reason), retire (reason; ledger RETIRE for the remaining quantity). Ledger rows are
  append-only (DB trigger) and carry `balanceAfter`. `remainingQuantity` never goes below 0. A pool
  serves a machine if bound to it, bound to its type, or shared. Low stock: after any decrease, if
  `remaining ≤ lowThreshold` and `lowAlertedAt` is null → set `lowAlertedAt`, alert staff
  (email/chat per settings), emit `consumable.low_stock`; a restock above the threshold clears it.

## 2. Jobs (phase 3)

- **Eligibility** (`SpaceJobSettings.eligibility`): ANYONE (signed-in non-members allowed, priced at
  PUBLIC rates), MEMBERS_ONLY, STAFF_ONLY (only staff create jobs on behalf of a person by email).
  Also `jobsEnabled`, type and machine `acceptsJobs`, `maxOpenJobsPerRequester` (space default,
  type override), rate limits on submit. The audience snapshot on the job is MEMBER when the
  requester is an ACTIVE `SpaceMember` (any role) at submission, else PUBLIC.
- **Submit** (`/s/[spaceSlug]/request` and from a public machine page): choose type (and machine
  when `requesterPicksMachine`), title, description, source link, request fields, quantity, files.
  Files are validated against the type's file policy: extension allowlist, size, count, magic bytes
  (3MF/ZIP must start `PK\x03\x04`; STEP must contain `ISO-10303`; PDF `%PDF-`; images sniffed; STL
  binary must have consistent size (84 + 50 × triangles) or start `solid` ASCII; G-code must be
  text; polyglot guard: a file sniffing as PDF/image with another extension is rejected). Parsers in
  `lib/files/` extract STL triangle count + bounding box and G-code slicer estimates (PrusaSlicer,
  Cura, Bambu/Orca headers: print time, filament grams/length) into `JobFile.metadata`, which
  pre-fills estimates for staff. Files live in private storage under `spaces/<spaceId>/jobs/<jobId>/`,
  sha256 recorded; downloads only for the requester and staff with jobs.view, via short-lived URLs or
  the app route. Status starts SUBMITTED; if the type has `requiresApproval=false` and the price can be
  computed without estimates (FREE or FLAT) the job is auto-approved by the system.
- **Lifecycle** (only `lib/jobs/transitions.ts` changes `status`, each in a transaction that row-locks
  the job, then machine, then pool; every transition writes a `JobEvent`):
  - approve (jobs.review): SUBMITTED → APPROVED with estimates, note, optional priced override
    (reason required, payments.manage). Computes the quote and creates payments (§3).
  - reject (jobs.review, reason required): SUBMITTED|APPROVED → REJECTED; refunds per `refundOnReject`.
  - cancel: requester (if `allowRequesterCancel`) from SUBMITTED|APPROVED; staff (jobs.review) from
    SUBMITTED|APPROVED|PAUSED. Releases any reservation; refunds per `refundOnCancel`.
  - start (jobs.operate): APPROVED → RUNNING. Machine: given, or first IDLE active machine of the
    type when `allocationPolicy=FIRST_IDLE`; must be same type, not retired, IDLE (or RESERVED for this
    job). Respects `maxConcurrentJobs`. Payment gate: UPFRONT needs the charge PAID, a deposit needs
    the deposit PAID, unless a payments.manage holder overrides with a reason. Reserves from a pool
    when the type has a consumable unit and a planned quantity is given (pool must serve the machine,
    match requested material/colour unless "no preference", enough stock). Takes the run snapshot.
    Machine → RUNNING. If the machine has an enabled printer connection, the adapter is asked to start
    (best effort; failures are reported, not fatal).
  - pause/resume (jobs.operate): RUNNING ↔ PAUSED (machine PAUSED/RUNNING).
  - complete (jobs.operate): RUNNING|PAUSED → COMPLETED with actual minutes and actual quantity
    (defaults to reserved). Reconciles the pool, writes a JOB `UsageLog` (machine meters +minutes,
    +1 job), computes the final price and balances payments (§3). Machine → IDLE.
  - fail (jobs.operate, reason, percent 0–100): RUNNING|PAUSED → FAILED; pool reconciled with
    reserved × percent unless an actual is given; usage log `succeeded=false`; refunds per
    `refundOnFailure`; machine → IDLE.
  - collect (jobs.operate): COMPLETED → COLLECTED. Blocked while money is owed when
    `requirePaymentBeforeCollection` and timing ≠ PAY_LATER, unless overridden with a reason.
  - reprint (jobs.review): from FAILED|COMPLETED|COLLECTED creates a new APPROVED job copying the
    request (reprintOf = root), re-quoted; files are referenced from the root job.
  - priority bump, reassign machine before start, internal and requester-visible notes.
- **Queue position** (`lib/jobs/queue.ts`, pure + tested): waiting = SUBMITTED, APPROVED. Scope = the
  requested machine when set, else the type. Order: priority desc, APPROVED before SUBMITTED,
  submittedAt, id. Returns position, approvedAhead, awaitingReviewAhead (only for SUBMITTED jobs), and
  an ETA = sum of estimated minutes ahead (+ remaining minutes of running jobs) ÷ active machines of
  the type. Shown to the requester as "#3 in the queue · 2 approved jobs ahead · about 1 h 20 min".
- **Requester area**: `/account/jobs` (all spaces) and `/s/[spaceSlug]/jobs/[number]`: timeline,
  queue position, time left while running (estimate − elapsed), files, notes, price and payment
  actions ("Pay now", "Payment pending"), cancel. A status link with the opaque `statusToken`
  (`/j/[token]`) shows only status, title, queue position and timestamps, no PII, no amounts.
- **Staff console**: `/dashboard/[spaceSlug]/jobs` board with columns by status and filters (type,
  machine, requester, payment state), job detail with every action as a dialog, "Awaiting
  collection" handover list, create-on-behalf.
- **Notifications** (`SpaceJobSettings.requesterEmails` / `staffAlerts`, defaults all on): requester
  email for submitted, approved (with quote and pay link when due), rejected, started, completed
  (ready to collect + amount due), failed, cancelled, payment received, refund issued; staff email +
  chat for submitted, cancelled, failed, payment received. Webhook events `job.<event>`.

## 3. Pricing and payments (phase 3)

- **Rule resolution** (`lib/pricing/resolve.ts`): machine rule for the audience → type rule → space
  default; for PUBLIC with no PUBLIC rule at any level: MEMBER rule when `publicUsesMemberRates`,
  else the job is not offered to the public (submission refused with a clear message). No rule at all
  = FREE. `paymentsEnabled=false` on the space forces FREE everywhere.
- **Engine** (`lib/pricing/engine.ts`, pure, exhaustively unit tested): FREE → 0. FLAT → flatFee per job. TIME → setupFee + rate × billable hours, billable minutes rounded up to
  `timeIncrementMinutes`. MATERIAL → setupFee + quantity × materialRate. TIME_AND_MATERIAL → both.
  Then `max(subtotal, minimumCharge)` for non-FREE modes. Round half-up to an integer at the end
  only. Tax: inclusive → total unchanged, tax part = round(total × bps / (10000 + bps)); exclusive →
  total = subtotal + round(subtotal × bps / 10000). Returns a breakdown (lines, subtotal, tax,
  total) stored as `pricingSnapshot`. The quote uses estimates; the final uses actuals.
- **Timing**: rule `paymentTiming` ?? space `defaultPaymentTiming`; PAY_LATER only when
  `allowPayLater`. UPFRONT: at approval create a CHARGE for the quote (PENDING); the job cannot start
  until it is PAID. ON_COMPLETION: optional DEPOSIT at approval (FIXED or PERCENT of the quote; must
  be paid before start), BALANCE = final − paid created at completion; collection waits for payment.
  PAY_LATER: like ON_COMPLETION but collection is allowed and the job shows "Payment pending".
  When the final total is lower than what was paid, create a PENDING `Refund` (OVERPAYMENT) for staff
  to process. Free jobs never create payments (`paymentState=NOT_REQUIRED`).
- **Methods**: online Razorpay and Stripe through each space's own account (encrypted keys in the
  space payment settings, provider chosen per space, both allowed); offline CASH, UPI,
  BANK_TRANSFER, CARD_TERMINAL, OTHER recorded by payments.manage staff with a reference; maker-checker
  confirmation when the space requires it; waive with reason. Razorpay: Payment Links API (amount in
  paise, reference_id = payment id, callback to the job page), webhook `payment_link.paid` /
  `payment.captured` verified by HMAC-SHA256 of the raw body with the space webhook secret, compared in
  constant time. Stripe: Checkout Session (mode payment, client_reference_id = payment id, metadata
  spaceId/jobId), webhook `checkout.session.completed` / `async_payment_succeeded` / `expired`
  verified with the Stripe signature scheme (t=, v1= HMAC-SHA256 of `t.body`, 5-minute tolerance)
  implemented without the SDK. Webhook URLs `/api/webhooks/razorpay/[spaceId]` and
  `/api/webhooks/stripe/[spaceId]`; idempotent through `ProcessedWebhookEvent`; settlement is
  row-locked and settles even if payments were since disabled. Never mint a second live checkout for
  one payment; an expired Stripe session is replaced on the next "Pay now".
- **Refunds** (`lib/payments/refunds.ts`): automatic proposals from the space refund rules on reject,
  cancel and fail (FULL, PERCENT of paid, NONE, MANUAL = staff decides), plus manual staff refunds
  (full or partial, reason required). Gateway payments refund through the gateway API (Razorpay
  `POST /v1/payments/{id}/refund`, Stripe `POST /v1/refunds`), offline ones are recorded as handed
  back. Refund total never exceeds the amount paid. Gateway clients are injectable so tests mock
  them; every timing × method × outcome combination has a test (free, flat, time, material, member
  vs public, deposit, upfront, on completion, pay later; online success/failure/expiry, offline,
  waive; refunds full/partial/manual on reject/cancel/fail; overpayment).
- **Staff money pages**: `/dashboard/[spaceSlug]/payments` (filter by status/method, record offline,
  confirm, waive, refund, export CSV) and the payment block on each job.

## 4. Upkeep (phase 4)

- **Usage**: `lib/usage/record.ts` is the only writer of `UsageLog` and machine meters (JOB on
  completion/failure, MANUAL by operators for runs outside the queue, ADAPTER from printer telemetry).
  A manual log can take stock from a pool (ledger MANUAL).
- **Maintenance schedules** (machine managers / maintenance.manage): TIME (every N days, next due
  date), USAGE_HOURS (every N machine hours since the last completion), JOB_COUNT (every N jobs).
  Due state: OK, DUE_SOON (within `maintenanceReminderDays` or 10 % of the usage interval), OVERDUE.
  Completing a schedule writes a `MaintenanceLog` and advances it (TIME: from the old due date;
  usage: resets the meter baseline). `blockWhenOverdue` puts the machine in MAINTENANCE and opens a
  downtime when it becomes overdue. A daily beat job notifies staff of due-soon and overdue schedules
  (once per due cycle via `lastNotifiedAt`) and emits `maintenance.due`.
- **Maintenance logs** (append-only): kind, summary, details, parts, cost, vendor, performed at/by,
  attachments (pdf/images ≤ 20 MB), optional link to a schedule or fault; "set machine back to idle"
  closes an open downtime.
- **Downtime**: start (reason, note) sets the machine to MAINTENANCE or OFFLINE; end returns it to
  IDLE. Reports compute availability = 1 − downtime ÷ period, MTTR from downtime with a fault, MTBF
  from faults.
- **Fault reports**: members (on the public machine page, signed in, member of the space) and staff
  report with severity, description, photos (≤ 4). Workflow OPEN → ACKNOWLEDGED → IN_PROGRESS →
  RESOLVED | WONT_FIX, assignee, resolution. HIGH/CRITICAL can take the machine offline (opens a
  downtime). Staff alerts + `fault.reported` / `fault.resolved` webhooks.
- **Warranty**: one per machine (vendor, contacts, contract number, coverage, purchased, starts,
  expires, documents). Status UNKNOWN / ACTIVE / EXPIRING_SOON (within `warrantyReminderDays`) /
  EXPIRED. Daily reminder once per expiry.
- **Service history**: per-machine timeline merging maintenance logs, downtime, faults, status
  changes, warranty events and usage milestones.
- **Reports** (`lib/reports/*` pure over rows, CSV export for each): jobs by status/type/machine over a
  date range with failure rate and turnaround; machine utilisation (hours run, jobs, availability,
  downtime); consumables used by material/pool and cost; revenue (paid, pending, refunded, waived by
  method, type, machine; never add currencies); maintenance (logs, cost, overdue, MTBF/MTTR);
  warranty list. Charts follow the design system.

## 5. Integrations (phase 5)

- **Printer adapters** (`lib/printers/`): `PrinterAdapter` interface — `capabilities`,
  `testConnection`, `getStatus` (state idle|printing|paused|error|offline, nozzle/bed actual and
  target °C, progress %, job name, elapsed/remaining seconds), `uploadFile`, `startJob`, `pauseJob`,
  `resumeJob`, `cancelJob`. Implementations: MANUAL (no telemetry; staff drive the job by hand),
  SIMULATED (deterministic simulation stored in `simState`: heats up, prints over the job's estimate
  scaled by a speed factor, supports pause/resume/cancel/error injection; fully working), and stubs
  for OCTOPRINT (REST `/api/version`, `/api/printer`, `/api/job`, `/api/files/local`, X-Api-Key),
  MOONRAKER (`/printer/objects/query`, `/server/files/upload`, `/printer/print/start|pause|resume|cancel`),
  BAMBU (MQTT over TLS 8883, `device/<serial>/report` and `/request`, LAN access code, FTPS upload) and
  PRUSALINK (`/api/v1/status`, `/api/v1/job`, `/api/v1/files`, digest auth). Stubs build correct
  request descriptors and are unit-tested for that, but `available=false`: the UI lists them with a
  "Coming soon" badge and cannot enable them. A beat job polls enabled connections (default every
  15 s for simulated), stores telemetry, syncs machine status and job progress, completes or fails
  the running job when `autoCompleteJobs`, and writes ADAPTER usage. Commands are logged.
- **Integration settings page** (`/dashboard/[spaceSlug]/machine-settings/printers` and a tab on the
  machine): adapter picker as cards with logos/icons and Coming soon badges, connection form (URL,
  device id, secret write-only), test connection, live telemetry card (temperatures, progress ring,
  state pill), command buttons, command log.
- **API keys**: per space, scopes (machines:read, machines:write, jobs:read, jobs:write,
  consumables:read, consumables:write, maintenance:read, maintenance:write, payments:read,
  reports:read), secret shown once (`swm_<prefix>_<secret>`, SHA-256 stored), expiry, revoke, last
  used. `/api/v1/*` resolves the space from the key, checks a scope, rate limits per key, returns
  minimal DTOs, cursor pagination. Endpoints: machines (list, get, set status), types, jobs (list,
  get, create on behalf of an account email, transitions), consumable pools (list, adjust), usage
  logs (create), maintenance schedules/logs (list, create log), faults (list, create), payments
  (list). OpenAPI 3.1 document at `/api/v1/openapi.json` and `docs/API.md`.
- **Webhooks**: endpoints per space (URL must pass the platform's public-host check, https only in
  production), event subscriptions, secret shown once, signature header
  `X-SpaceWorks-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`, `X-SpaceWorks-Event`,
  `X-SpaceWorks-Delivery`. Delivered by a BullMQ queue with retries (1 min, 5 min, 30 min, 2 h, 12 h);
  10 consecutive failures disable the endpoint and alert staff. Delivery log, send test, redeliver.
  Events: machine.created|updated|status_changed|retired, job.submitted|approved|rejected|started|
  paused|resumed|completed|failed|collected|cancelled, payment.paid|refunded, consumable.low_stock,
  maintenance.due|logged, fault.reported|resolved, downtime.started|ended. `lib/webhooks/emit.ts`
  (`emitWebhook(tx, spaceId, event, data)`) exists from phase 2 so earlier phases call it.
- **Audit log** page for audit.view with filters (actor, area, date) and CSV export.
