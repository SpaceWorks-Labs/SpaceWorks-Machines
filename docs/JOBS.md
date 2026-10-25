# Jobs and job payments

How Phase 3 is put together: the services to call and the rules they keep. Behaviour is specified in
`docs/plans/domain-behaviour.md` sections 2-4; this file maps it to code.

## Jobs: Service entry points

- `lib/jobs/index.ts`: `submitJob(input, dependencies?)`, `transitionJob(context, command, dependencies?)`,
  authorised file listing/downloads and queue calculations. The caller supplies the authenticated actor's
  user id and the server-resolved space id; the service rechecks membership, capabilities and space state.
- `lib/jobs/transitions.ts` owns every status update. Submission and reprints use the schema's SUBMITTED
  default, then approval passes through this module. Each mutation writes its timeline and audit events,
  subscribed webhook deliveries and applicable notifications in the same transaction.
- Locks follow job, then machine, then pool. Starts/resumes also take a type advisory lock between job and
  machine to serialise the RUNNING capacity check. Submission serialises open-job limits by requester.
- `lib/usage/index.ts`: `recordUsage(tx, input)` runs in the caller's transaction. Every row represents one
  run and adds its minutes and one job to the machine meters, including failed runs. JOB is for queued runs;
  ADAPTER is a trusted system entry point for aggregated runs outside the queue, not individual polling
  samples. MANUAL checks the operator capability and can take stock through the MANUAL ledger kind.
- `lib/pricing/index.ts`: pure rule resolution and exact arithmetic. Intermediate calculations use bigint
  fractions; subtotal and tax round half-up. Quotes preserve the resolved rule/tax snapshot for actuals.
- `lib/files/index.ts`: policy validation and STL/G-code metadata. Job submission re-encodes accepted images
  through the existing image pipeline, strips metadata, and hashes the bytes actually stored.


## Jobs: Details for the next step

- Inject `JobPaymentEffects` to implement M3b settlement. Hooks execute inside the job transaction and must
  avoid network calls and respect its lock order. The default creates no Payment rows; zero-priced jobs
  pass, other jobs return an unpaid gate. Overrides require payments.manage and a non-blank reason.
- An explicit price override is an agreed tax-inclusive total, preserved at completion. Disabling payments
  forces new quotes to FREE and disallows a positive override. Existing approved snapshots remain stable.
- Reassignment changes assignedMachineId while preserving the requested machine. Before approval, the
  assigned machine participates in rule resolution; after approval, the agreed quote remains unchanged.
- Start's optional printer callback executes after commit. Missing adapters, lookup errors and start errors
  produce a warning. Actual adapter implementations belong to Phase 5.
- Reprints reference root JobFile rows through reprintOfId, using the new job's access check. Files stay in
  private `spaces/<spaceId>/jobs/<jobId>/` storage; a future route can call downloadAuthorisedJobFile.
- Queue ETA sums estimates ahead and remaining running/paused estimates, divided by active machines of the
  type. Callers supply active machines; no active machines means an unknown ETA. Missing estimates add zero.
- The space open-job limit counts SUBMITTED, APPROVED, RUNNING, PAUSED and COMPLETED jobs. A type override
  applies to open jobs of that type. Submitted files are removed if the job transaction rolls back.
- G-code variants must contain UTF-8 text; binary BGCode decoding is outside the requested text-only policy.
- M3b payment creation, gateway settlement and refunds; Phase 5 adapters; and job UI/actions/routes remain
  subsequent work. Nothing requested for M3a is intentionally deferred.

## Payments: Entry points

- `lib/payments/jobs`: `jobPaymentEffects` is now the default for submission, auto-approval,
  reprint and transitions. Hooks perform SQL only inside the caller's job transaction.
- `createJobCheckout({ spaceId, actorId, paymentId }, clients?)`: requester or payments manager;
  returns the persisted Payment with its redirect URL. Clients are injectable by provider.
- `recordOfflinePayment(context, { method, reference, note? })`, `confirmOfflinePayment(context)`,
  `waivePayment(context, reason)`: payments.manage, active membership and staff MFA are checked.
- `lib/payments/refunds`: `createRefund(context, { amount?, reason, note })` proposes a staff
  refund; omitted amount means the unreserved remainder. `processRefund({ spaceId, actorId,
  refundId }, clients?)` executes/reconciles a gateway refund. `handBackRefund(context, reference)`
  records an offline return. Automatic policy and overpayment proposals require staff processing.
- Existing signed gateway routes use `handleWebhook`; `applyGatewayEvent` settles payments and
  refunds in the same transaction as ProcessedWebhookEvent. Enablement switches do not prevent
  settlement of money received. Amount, currency, provider and identifiers must match.


## Payments: Behaviour and concurrency

UPFRONT creates a CHARGE. ON_COMPLETION and PAY_LATER optionally create a DEPOSIT, with its policy
snapshotted at approval. Completion reconciles the final cost and creates a BALANCE when needed.
Unrecorded obligations without a live checkout are superseded; outstanding checkouts and recorded cash
remain accounted for. Paid or waived obligations satisfy gates; refunded money does not. Collection
honours the space setting and PAY_LATER. Overrides retain M3a's payments.manage/reason/audit checks.
Free jobs create no payments. All arithmetic uses integer minor units in one job currency.

All payment/refund writers lock Job before Payment. Job hooks already hold the job lock, so they
serialise with settlement, offline receipts, confirmations, waivers and refund proposals. Pending
refunds reserve capacity; succeeded refunds increment payment and job totals exactly once. Terminal
job captures also propose the relevant refund, covering a cancellation racing with online payment.
Requester email, staff payment email/chat and signed outbound webhook delivery rows commit with
settlement; delivery queues are nudged after commit. Notification preferences are respected.

Checkout and refund intents commit before HTTP. Stripe retries reuse a durable idempotency key;
confirmed expiry permits a new key/session. Local expiry first checks provider status. A Razorpay
Payment Link has a unique payment-id reference and is recovered by that reference after a lost
response. Active/uncertain online checkouts prevent changing to cash or waiving the obligation.
Unresolved requests remain reserved. When provider lookup cannot resolve a refund, Razorpay does
not blindly POST it again; Stripe's retry key is used only within 23 hours. Beyond that window,
reconciliation is required before another request, preserving the refund cap across network failure.

Provider references: [Razorpay Payment Links](https://razorpay.com/docs/api/payments/payment-links/create-standard/),
[reference lookup](https://razorpay.com/docs/api/payments/payment-links/fetch-all-standard),
[link-paid payloads](https://razorpay.com/docs/webhooks/payment-links/),
[Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create).


## Payments: One migration

`0003_job_payments` adds Payment.checkoutKey/checkoutStartedAt and Refund.gatewayAttemptedAt.
These durable intent fields distinguish a fresh operation from an unresolved provider response;
transaction rollback alone cannot undo a successful external request. It also adds
SpaceJobSettings.refundOnRejectPercent (default 100, constrained to 0–100), because reject previously
allowed PERCENT without storing its percentage. No existing domain rows are rewritten.
Applied to the disposable TEST_DATABASE_URL with `scripts/prisma.mjs migrate deploy`.
