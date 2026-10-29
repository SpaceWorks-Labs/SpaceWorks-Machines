# Space Works Machines REST API and webhooks

## REST API (`/api/v1`)

- **Keys:** create them under **Integrations → API keys** (machine managers). A key belongs to one space and carries
  scopes. The token (`swm_<prefix>_<secret>`) is shown once; only its SHA-256 is stored. Keys can expire and be revoked.
- **Auth:** `Authorization: Bearer swm_…`. Unknown, revoked and expired keys answer `401`. A missing scope answers
  `403`. Writes act as the person who created the key, who must still be active staff of the space with the matching
  permission and an authenticator; otherwise `403`.
- **Limits:** 600 reads and 60 writes a minute per key (`429` beyond that).
- **Shapes:** lists answer `{ data, nextCursor }`. Pass `?cursor=<nextCursor>&limit=1..100` for the next page.
  Single items answer `{ data }`. Errors answer `{ error }`, and validation errors also carry `issues`. Business
  rule refusals are `409`. Amounts are integer minor units in the space currency. Payloads never carry emails,
  notes, files or secrets.
- **Description:** the OpenAPI 3.1 document is at `/api/v1/openapi.json`.

| Method and path | Scope | Notes |
| --- | --- | --- |
| `GET /machines` · `GET /machines/{id}` | machines:read | Filters `typeId`, `status` |
| `POST /machines/{id}/status` | machines:write | `{ status: IDLE \| RESERVED \| MAINTENANCE \| OFFLINE, note }` |
| `GET /types` | machines:read | |
| `GET /jobs` · `GET /jobs/{id}` | jobs:read | Filter `status` |
| `POST /jobs` | jobs:write | Create on behalf of `requesterEmail` (no files) |
| `POST /jobs/{id}/transitions` | jobs:write | `{ kind, … }`: same rules as the staff console |
| `GET /consumables` | consumables:read | |
| `POST /consumables/{id}/adjustments` | consumables:write | `{ kind: restock \| correction, quantity, reason }` |
| `POST /usage` | maintenance:write | A run outside the queue |
| `GET /maintenance/schedules` · `GET /maintenance/logs` · `POST /maintenance/logs` | maintenance:read / write | Positive costs require the creator's current finance permission. |
| `GET /faults` · `POST /faults` | maintenance:read / write | |
| `GET /payments` | payments:read | Filter `status` |

## Outbound webhooks

- **Endpoints:** set them up under **Integrations → Webhooks**. Each endpoint has an https URL that must resolve to
  public addresses (checked when saved and before every send), the events it subscribes to, and a signing secret
  that is shown once.
- **Headers:** each delivery is a `POST` of `{ id, event, spaceId, createdAt, data }` with:
  - `X-SpaceWorks-Event`: the event name
  - `X-SpaceWorks-Delivery`: the delivery id
  - `X-SpaceWorks-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`
- **Verifying:** recompute the HMAC with the endpoint's secret, compare it in constant time, and reject old
  timestamps.
- **Answering:** answer with any 2xx within 10 seconds.
- **Retries:** after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then the delivery fails.
- **Switching off:** after 10 failed deliveries in a row, the endpoint is switched off and the people who manage
  integrations get an email.
- **Delivery log:** shows every attempt. "Send again" repeats a delivery with the same event `id`, so receivers
  can de-duplicate. "Send test" sends a `webhook.test` event.

Events: `machine.created|updated|status_changed|retired`, `job.submitted|approved|rejected|started|paused|resumed|
completed|failed|collected|cancelled|reprinted|priority_changed|reassigned|noted`, `payment.paid|refunded`,
`consumable.low_stock`, `maintenance.due|logged`, `fault.reported|resolved`, `downtime.started|ended`, `repair.paid`,
`finance.entry_posted` (ids, direction, category, amount and currency only).

## Printer connections

Each machine can have one connection, set up under the machine's **Printer** page.

- **Manual:** no connection; staff run the machine by hand.
- **Simulated:** heats up, prints over the job's estimate and supports pause, resume, cancel and an injected
  error. Use it to try the whole flow.
- **Coming soon:** OctoPrint, Moonraker/Klipper, Bambu Lab (LAN MQTT) and PrusaLink are listed but can't be enabled
  yet. Their request mapping lives in `lib/printers/stubs.ts`.

The `printer-poll` beat job runs every 15 seconds. It reads telemetry, keeps the running job's progress, and
completes or fails the job when the print ends, acting as whoever started the job. It records usage for runs
started at the printer, and mirrors idle, printing and paused onto the machine.
