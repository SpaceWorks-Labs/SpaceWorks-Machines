# Space Works Machines — Domain Spec (ported from SpaceWorks Django)

Source surveyed (read-only): `ref/SpaceWorks` — `backend/apps/machines` (~7k lines), `backend/apps/maintenance`,
`backend/apps/warranty`, machine-related `backend/apps/payments`, `backend/apps/maker_file_formats.py`,
`backend/apps/admin_api/*machine*`, `backend/apps/operations/reports_*`, `backend/config/settings.py`, and the
frontend under `frontend/src/features/{staff/panels/machine,printing,inventory,members,stats}`. Rules from
`CLAUDE.md` and `docs/INVARIANTS.md` (§ "Machine scoping", § "Payments") are folded in.

This document describes **domain behaviour**, not Django code. Where the source has a bug or an
unenforced flag, it is called out under "Gotcha" so the port can decide deliberately.

---

## 0. Orientation — what exists and what does not

| Area | Status in source |
|---|---|
| Machine catalogue (types, machines, operators, docs, images, public listing) | Built (`machines` module) |
| Job/service requests with queue, consumable reservation, pricing | Built (`machine_service` module). **One generic kernel** for all machine types |
| 3D printing | **Not a separate app any more.** `apps/printing` is a tombstone (models retired in migration `printing/0022`). Printing = the built-in global `3d_printer` machine type + its "capability pack" inside `machines`. Module key `printing` gates only the public printer surfaces/emails/reports; it **requires** `machine_service` |
| Consumables | Two systems: (a) **pools** (`MachineConsumablePool`, ledgered, reserved/reconciled by jobs) and (b) **per-machine linked consumables** (`MachineConsumable`, count → inventory product or grams, debited manually or at job end) |
| Maintenance | Schedules (interval days) + append-only logs + log attachments (`maintenance` module) |
| Fault reports | `MachineErrorLog` (append-only, severity) — no workflow |
| Downtime | No dedicated model. Downtime = `Machine.status` in `maintenance`/`offline` (status changes audited) |
| Warranty | One `Warranty` per machine (or per inventory asset), docs, computed status, report |
| Usage metering | Manual hour entries + "typed manual usage" ledger; job minutes live on the request |
| Payments | Generic `Payment` row per subject; Stripe (raw keys or Connect) and Razorpay (Payment Links); offline/counter settlement; waive |
| Reports | machine-service, printer-service, machine-usage, maintenance-activity, FabLab health; JSON + CSV/XLSX export |
| Hardware integration (OctoPrint/Moonraker/Bambu/PrusaLink) | **None.** Only a free-text `camera_feed_url` and `firmware_version` on Machine. The only "Bambu" mention is a UI label "Estimated print-time screenshots (Bambu Lab)" |
| File parsing (STL/3MF/GCODE geometry, slicing, time/weight estimation) | **None.** Only extension/MIME pairing + magic-byte signature checks (3MF zip, STEP header, PDF/image sniff). Grams/minutes are typed by humans |
| Training / certification / access gating | **Does not exist** for machines in this codebase (the only "certificates" are event-feedback certificates). Closest concept is per-machine `MachineOperator` rows. Excluded from this spec per brief |
| Requester cancellation of a job | **Does not exist.** No cancel transition at all (see §3) |
| Refunds | Explicitly out of scope in source; only an audit flag `payment.double_paid_refund_required` |
| Taxes/GST | **None.** No tax fields, no tax math anywhere |
| Member vs non-member pricing | **None.** One price per (makerspace × machine type) |

Module keys (per makerspace, toggleable): `machines` (registry, operators, usage, docs, warranty for machines),
`machine_service` (requests, queues, pools, consoles), `printing` (public 3D-print surfaces; requires
`machine_service`), `maintenance`, `payments` (default-enabled), `reports`, `procurement` (low-stock auto-restock).
Feature flags under payments: `payments.enabled` (master switch) and `payments.machines` (domain switch).

---

## 1. Data model

Conventions: every row is tenant-scoped to a makerspace either directly (`makerspace_id`) or through
its machine. Decimal money/quantity fields are `DECIMAL(12,2)` unless noted. "Append-only" means the
ORM refuses update/delete (and for some tables Postgres triggers also enforce it).

### 1.1 MachineType (catalogue)

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| makerspace_id | FK nullable, CASCADE | NULL = global built-in |
| slug | slug(50) | unique among globals (`makerspace IS NULL`); unique per makerspace among locals. **Not globally unique** — a lab may create a local type with a built-in's slug |
| name | str(200) | local types: case-insensitive unique per makerspace (validated on update) |
| icon | str(50) | free text |
| is_builtin | bool | CHECK: `(is_builtin AND makerspace IS NULL) OR (NOT is_builtin AND makerspace IS NOT NULL)` |
| managing_action | str(64) | server-only. `3d_printer` → `manage_printing`; others blank. Gives "type manager" authority (see §9) |
| capability_config | JSON object | structural config only; **pricing/payment keys forbidden** (`rate_per_unit`, `flat_fee`, `currency`, `payment_enabled`, `payment_authorized`, `authorization`) |

Seeded global built-ins: `3d_printer` "3D Printer" (managing_action `manage_printing`), `laser_cutter`,
`cnc_mill`, `cnc_router`, `vinyl_cutter`, `pcb_mill` "PCB Milling Machine", `other`, `resin_printer` (see §2).

### 1.2 MakerspaceMachineTypePricing

| Field | Type | Notes |
|---|---|---|
| makerspace_id | FK PROTECT | |
| machine_type_id | FK PROTECT | must be global or belong to this makerspace |
| rate_per_unit | dec(12,2) ≥ 0, default 0 | |
| flat_fee | dec(12,2) ≥ 0, default 0 | |
| payment_enabled | bool default false | if false, job price is 0 |
| created_by / updated_by | FK user SET_NULL | |
| created_at / updated_at | ts | |
| UNIQUE (makerspace, machine_type) | | |

Currency is **not** stored here — it is the makerspace's `MakerspacePaymentSettings.default_currency`.

### 1.3 Machine

| Field | Type | Notes |
|---|---|---|
| makerspace_id | FK CASCADE | |
| machine_type_id | FK PROTECT | **immutable after create** (escalation guard) |
| name | str(200) | not unique |
| location | str(200) | |
| notes | text | |
| status | enum `idle` \| `running` \| `reserved` \| `maintenance` \| `offline` | default `idle`. `reserved` exists but nothing sets it automatically |
| firmware_version | str(100) | free text |
| camera_feed_url | URL | free text, not proxied |
| image_key | str(300) | object key in public-image bucket, prefix `machine/<makerspace_id>/` |
| is_public | bool default false | shows on public machines page |
| is_active | bool default true | false = retired |
| service_file_policy | JSON `{name, version}` | default `{"name":"documents","version":1}`; must resolve to a known policy |
| type_payload | JSON | per-type details; printers require exactly `{"model": "<non-empty>"}` (default `"Unspecified"` on create) |
| created_by | FK user | |
| created_at / updated_at | ts | |
| legacy_print_printer_id | int unique | migration provenance — skip in port |

Derived: `usage_hours = SUM(MachineUsageEntry.hours)`; `warranty_status` (§7.6); per-actor capability
flags `can_operate`, `can_edit`, `can_delegate`, `can_retire`, `can_unretire` (§9).

### 1.4 MachineOperator (per-machine delegation)

| Field | Type | Notes |
|---|---|---|
| machine_id | FK CASCADE | |
| user_id | FK CASCADE | must be an ACTIVE member of the machine's makerspace when assigned, and is re-verified live on every check |
| access_level | enum `operate` \| `manage` \| `full` | |
| assigned_by | FK user | |
| assigned_at | ts | |
| UNIQUE (machine, user) | | |

### 1.5 ServiceQueue (pooled queue per machine type)

| Field | Type | Notes |
|---|---|---|
| makerspace_id | FK PROTECT | |
| machine_type_id | FK PROTECT | global or same-tenant |
| name | str(200) | UNIQUE (makerspace, name) |
| description | text | shown publicly |
| is_active | bool | |
| capacity | int nullable | max concurrent `in_progress` jobs in this queue; NULL = unlimited |
| allocation_policy | enum `first_idle` \| `staff_select` | default `staff_select` |
| legacy_print_bucket_id | int | provenance — skip |

Gotcha: there is **no API or UI to create a ServiceQueue**. Queues were created by the printing
cutover migration (legacy "Public Requests" bucket → queue) and tests; the Django admin view is
read-only. The port must add queue CRUD.

### 1.6 ServiceBucket (legacy per-machine queue)

| Field | Type | Notes |
|---|---|---|
| machine_id | FK PROTECT | |
| name | str(200) | UNIQUE (machine, name). Default bucket is named `"Service Requests"`, auto-created on first submission to a machine |
| description, is_active, timestamps | | |

A request targets **either** a bucket (a specific machine) **or** a queue (any compatible machine) — never both.

### 1.7 MachineServiceRequest (the job)

| Field | Type | Notes |
|---|---|---|
| bucket_id / queue_id | FK PROTECT, nullable | CHECK exactly one non-null |
| makerspace_id | FK PROTECT | derived from bucket.machine or queue on insert |
| requester_id | FK user PROTECT | the account that submitted (or the member staff submitted for) |
| member_id | FK user SET_NULL nullable | ownership for member surfaces (introduced later; use this for "my jobs") |
| requester_name, contact_email, contact_phone | text | snapshot copied from the account at submission; **PII — encrypted at rest when scoped-PII is enabled**, never in public projections |
| public_token | UUID unique | anonymous status-lookup token |
| title | str(200) | required |
| description | text | |
| source_link | URL(200) | |
| status | enum (see §3) | default `pending`. **Bulk `queryset.update(status=…)` is forbidden** — only the workflow may change it |
| reason | text | accept note / rejection reason / failure reason (single field, last writer wins) |
| assigned_machine_id | FK SET_NULL | set on insert for bucket requests; set at `start` for queue requests |
| handled_by | FK user | last actor of any transition |
| accepted_by, accepted_at | | |
| started_at, completed_at, failed_at | ts | |
| collected_by, collected_at | | |
| estimated_minutes | int ≥ 0, default 0 | |
| actual_minutes | int ≥ 0, default 0 | |
| fail_percent_complete | smallint 0..100 | |
| capability_payload | JSON | type-pack request details (printer: material, colour, quantity, …) |
| planned_grams, reserved_grams, actual_consumed_grams | dec ≥ 0, default 0 | weight-metered legacy columns, kept in sync |
| metering_unit | enum `minutes`\|`weight`\|`volume`\|`length`\|`count`, nullable | set at reservation |
| planned_quantity, reserved_quantity, actual_consumed_quantity | dec ≥ 0 nullable | generic metering |
| run_consumable_pool_id | FK PROTECT nullable | pool reserved against |
| run_machine_name, run_machine_model | str | **run-sheet snapshot taken at `start`** |
| run_consumable_label, run_consumable_material, run_consumable_color | str | snapshot at start |
| run_estimated_minutes, run_planned_grams | | snapshot at start |
| reprint_of_id | FK self PROTECT | always points at the **root** original |
| payment_amount, payment_status (default `"none"`), paid_at | | **legacy read-only** columns; superseded by `Payment` rows. Do not port as writable |
| created_at / updated_at | ts | |

Indexes: (requester, -created), (member, -created), (bucket, status, -created), (queue, status, -created),
(assigned_machine, status, -created), completed_at, failed_at.

### 1.8 ServiceRequestFile (job attachments)

| Field | Type | Notes |
|---|---|---|
| service_request_id | FK CASCADE nullable | NULL while staged (public flow uploads before the request exists) |
| makerspace_id | FK PROTECT | |
| machine_id / queue_id | FK | the upload context |
| kind | enum `attachment`\|`model`\|`estimate`\|`preview`\|`screenshot` | public printer flow uses `model` (from kind `stl`) and `screenshot` |
| object_key | str(255) unique | `machine/<ms>/<machine_id or queue-<id>>/service/<uuid hex>` in the PRIVATE bucket |
| content_type, original_filename, size_bytes | | |
| owner_user_id | bigint | uploader; only the owner may finalize/attach |
| file_policy_name, file_policy_version | | **snapshot of the policy at staging time** |
| created_at, attached_at | ts | once `attached_at` is set, metadata is immutable |

### 1.9 MachineConsumablePool (ledgered stock: filament spools, resin, vinyl, etc.)

| Field | Type | Notes |
|---|---|---|
| makerspace_id | FK PROTECT | |
| machine_id | FK PROTECT nullable | "bound" pool |
| machine_type_id | FK PROTECT nullable | "type" pool; CHECK not both machine and type |
| material | str(100) required | |
| color | str(100) | |
| color_hex | str(7) | `""` or `^#[0-9A-Fa-f]{6}$` (stored lowercase) |
| brand | str(100) | |
| unit | enum `grams`\|`milliliters`\|`millimeters`\|`count` | default grams; printer pools must be grams |
| lot_code | str(100) | |
| initial_grams | dec ≥ 0 | **immutable** after create (name is historical; holds the quantity in `unit`) |
| remaining_grams | dec | CHECK `0 ≤ remaining ≤ initial` |
| low_threshold_grams | dec nullable | triggers auto-restock (§6) |
| is_active | bool | false = retired |
| is_public | bool default true | offered on the public print form |
| opened_at | ts nullable | informational |
| created_by, timestamps | | |

Derived `label` = join of non-empty `brand material color lot_code`.

Scope semantics: pool with `machine_id` → serves only that machine; with `machine_type_id` → serves
any machine of that type; neither → **shared**, serves every machine in the makerspace.

### 1.10 MachineConsumableAdjustment (pool ledger, append-only)

| Field | Type | Notes |
|---|---|---|
| consumable_pool_id | FK PROTECT | |
| makerspace_id | FK PROTECT | |
| kind | enum `reserve`\|`reconcile`\|`manual`\|`correction`\|`retire` | |
| quantity_delta | dec, CHECK ≠ 0 | negative = stock out |
| metering_unit | enum, default `weight` | |
| consumed_quantity | dec | mirrors delta |
| service_request_id | FK nullable | |
| usage_entry_id | FK nullable | |
| reason | text | |
| created_by, created_at | | |

### 1.11 MachineConsumable (per-machine linked consumable)

| Field | Type | Notes |
|---|---|---|
| machine_id | FK CASCADE | |
| measurement | enum `count`\|`grams` | CHECK: count ⇒ product NOT NULL; grams ⇒ product NULL |
| product_id | FK inventory product PROTECT | count mode: a quantity-tracked, non-archived, same-tenant inventory product; stock lives in inventory |
| label | str(200) | required for grams mode |
| remaining | dec | grams mode only (count mode stores 0) |
| low_threshold | dec nullable | UI "Low" badge only — no alert |
| note | str(255) | |
| UNIQUE (machine, product) | | |

### 1.12 ServiceRequestConsumption (per-job debit of linked consumables, append-only)

`service_request_id`, `machine_consumable_id`, `measurement` (count|grams), `product_id` (snapshot),
`label` (snapshot; product name for count rows), `quantity` > 0 (≥ 0.01, 2dp), `outcome`
(`completed`|`failed`), `created_by`, `created_at`. UNIQUE (service_request, machine_consumable).

### 1.13 MachineUsageEntry (usage ledger, append-only)

| Field | Type | Notes |
|---|---|---|
| machine_id | FK CASCADE | |
| hours | dec(10,2) ≥ 0 | |
| source | enum `manual` ("Manual hours") \| `typed_manual` ("Typed manual service") | |
| note | str(255) | |
| service_request_id | FK nullable | typed manual usage can be attached to a job |
| consumable_pool_id | FK nullable | |
| duration_minutes | int | typed only |
| outcome | `"success"`\|`"failed"`\|`""` | |
| percent_complete | 0..100 default 100 | |
| reason | text | required when failed |
| consumed_grams | dec ≥ 0 | |
| metering_unit, consumed_quantity | | |
| title, requester_name, contact_email, contact_phone | | legacy manual-print-log PII (encrypted); never public |
| logged_by, created_at | | |

### 1.14 MachineDocument

`machine_id`, `doc_type` (`manual`|`sop`), `object_key` unique (prefix `machines/<ms>/…`, private bucket),
`original_filename`, `content_type`, `size_bytes`, `uploaded_by`, `created_at`. Deletable (also deletes object).

### 1.15 MachineErrorLog (fault log, append-only by convention)

`machine_id`, `severity` (`info`|`warning`|`error`|`critical`), `message` text, `logged_by`, `created_at`.

### 1.16 Role ↔ machine scope links

`RoleMachineTypeScope(role_id, machine_type_id)` and `RoleMachineScope(role_id, machine_id)`, each
UNIQUE per pair. See §9.

### 1.17 Maintenance

**MaintenanceSchedule**: `machine_id` CASCADE, `description` text, `interval_days` int > 0,
`next_due` date, `is_active` bool, `created_by`, timestamps. Index (machine, is_active, next_due).
Derived `overdue = is_active AND next_due < today`.

**MaintenanceLog** (append-only — save on existing row or delete raises): `machine_id`, `performed_by`
(PROTECT), `performed_at` (tz-aware, default now), `summary` text required, `cost` dec(12,2) nullable ≥ 0,
`parts_note` text, `created_at`.

**MaintenanceLogDocument**: `log_id`, `object_key` (500, unique), `size_bytes`, `uploaded_by`, `created_at`.

### 1.18 Warranty

**Warranty**: `makerspace_id`, `asset_id` (OneToOne inventory asset) XOR `machine_id` (OneToOne machine) —
CHECK exactly one host; host must be same makerspace. `purchased_on` date?, `warranty_expires_on` date?,
`vendor_name` str(200), `vendor_contact` str(200), timestamps.

**WarrantyDocument**: `warranty_id`, `object_key` (300 unique), `original_filename`, `content_type`,
`size_bytes`, `uploaded_by`, `created_at`. Object deleted from storage after commit on any delete path.

### 1.19 Payments (shared across domains)

**Payment**

| Field | Type | Notes |
|---|---|---|
| makerspace_id | FK PROTECT | owner (whose merchant account is charged) |
| subject_type | enum `machine_service_request`\|`booking`\|`event_registration`\|`makerspace_membership` | |
| subject_id | bigint | polymorphic; must exist in the same makerspace on create |
| member_id | FK user PROTECT | payer |
| via_makerspace_id | FK SET_NULL | routing hint for collaborative events (irrelevant to machines) |
| subject_label | str(255) | snapshot for receipts; **machine jobs deliberately leave it blank** (title may contain PII); live lookup uses the job title while the job exists |
| amount | dec(12,2) CHECK > 0 | |
| currency | 3 lowercase letters | |
| status | enum `pending`\|`paid_online`\|`paid_offline`\|`waived`\|`canceled` | |
| provider | `stripe`\|`razorpay` | immutable once set |
| external_order_id / external_payment_id | str | UNIQUE per provider when non-null |
| checkout_url | URL | generic hosted-page URL |
| stripe_provider | `raw`\|`connect` | how Stripe creds resolved; immutable |
| stripe_connected_account_id, stripe_application_fee_amount (minor units) | | immutable |
| online_rail | `checkout`\|`native_payment_intent`, nullable | immutable once set |
| stripe_checkout_session_id (unique), stripe_checkout_url, stripe_checkout_session_expired_at, stripe_payment_intent_id (unique) | | |
| created_by | FK user PROTECT | |
| timestamps | | |

Constraints: UNIQUE (makerspace, subject_type, subject_id) — **one payment per job**. Terminal rows
(status ≠ pending) cannot change status or amount (ORM + Postgres BEFORE UPDATE/DELETE trigger); the
single allowed exception is `waived → paid_online` with unchanged amount, enabled via a
transaction-local GUC when a provider confirms real money arrived after a waiver.

**ProcessedStripeEvent** (webhook idempotency for all providers): `makerspace_id`, `provider`,
`stripe_event_id`; UNIQUE (makerspace, provider, event_id).

**MakerspacePaymentSettings** (1:1 makerspace): `provider` (`stripe`|`razorpay`), Stripe
`publishable_key` / `secret_key` (encrypted) / `webhook_secret` (encrypted), `default_currency`
(default `usd`, lowercase ISO), Stripe Connect fields (`connect_account_id` `acct_…`, `connect_status`
unconnected|pending|active|restricted|disconnected, charges/payouts enabled), Razorpay `key_id` (plain),
`key_secret` and `webhook_secret` (encrypted).

**PlatformStripeConnectSettings** (singleton, managed hosting only): platform keys + `application_fee_bps`
(0..10000).

---

## 2. Machine types & capabilities

### 2.1 Capability config ("type packs")

`capability_config` is a versioned, server-validated JSON contract. Rules:

- Must be an object; forbidden keys: `rate_per_unit`, `flat_fee`, `currency`, `payment_enabled`,
  `payment_authorized`, `authorization` (pricing lives in §4's table).
- **Custom (makerspace-local) types require** `metering_unit` ∈ {minutes, weight, volume, length, count}
  and `requires_booking` (strict bool). Optional `accepted_materials` / `accepted_colours`: non-empty
  list of non-blank strings, no case-insensitive duplicates.
- Built-in packs seeded:

| slug | config |
|---|---|
| `3d_printer` | see 2.2 |
| `resin_printer` | `metering_unit: volume`, `requires_booking: false`, `pooled_service_queue: true`, `typed_consumable_pools: true`, `pool_unit: milliliters`, `consumable: resin` |
| `laser_cutter` | `metering_unit: minutes`, `requires_booking: true` |
| `cnc_router` | `metering_unit: minutes`, `requires_booking: true` |
| `vinyl_cutter` | `metering_unit: length`, `requires_booking: false`, `pooled_service_queue: true`, `pool_unit: millimeters` |
| `cnc_mill`, `pcb_mill`, `other` | `{}` (empty) |

- Metering unit → pool unit mapping: weight→grams, volume→milliliters, length→millimeters, count→count;
  minutes → **no pool** (minutes-metered types do not use consumable pools).

Gotcha: `requires_booking`, `pooled_service_queue`, `typed_consumable_pools`, `printer_hours`,
`run_sheet_required`, `pool_unit`, `consumable` are **declarative only — nothing in the backend reads
them** (except the printer pack's shape validation). The UI shows "Booking required"/"No booking".

Built-in types cannot be edited via the API (name/icon/config). Custom types: create (slug, name, icon,
capability_config) / update (name, icon, capability_config) — slug immutable. **Only a Space-Manager
identity** may create/update types or set pricing (not mere `manage_machines` holders).

UI metering-unit labels/defaults: new custom type defaults to `{metering_unit: "count", requires_booking: false}`.

### 2.2 The 3D-printer pack (`3d_printer`, global only)

Exact required config (key set must match exactly):

```json
{
  "schema": "3d-printer-v1",                 // protected
  "service_payload_schema": "printer-v1",    // protected
  "machine_payload_schema": "printer-machine-v1", // protected
  "accepted_materials": ["PLA", "PETG", "TPU"],
  "accepted_colours": ["Black", "Blue", "Green", "Red", "White", "Gray"],
  "metering_unit": "weight",
  "pooled_service_queue": true,              // must be true
  "typed_consumable_pools": true,            // must be true
  "service_file_policy": {"name": "printer", "version": 1}, // protected
  "printer_hours": true,                     // must be true
  "run_sheet_required": true                 // must be true
}
```

Only `accepted_materials` / `accepted_colours` are editable (non-empty, unique case-insensitively).

"Is printer" test everywhere = `machine_type.makerspace_id IS NULL AND slug = '3d_printer'` (identify
by the global type's id, never by slug alone).

**Machine payload** (printer machines): exactly `{"model": "<non-empty string>"}`; created as
`{"model": "Unspecified"}` if omitted. Non-printer types accept any `type_payload`.

**Service request payload** (`capability_payload`) for printers — allowed keys only:

| key | rule |
|---|---|
| `requested_material` | required, must be in `accepted_materials` (case-insensitive) |
| `requested_color` | required, must be in `accepted_colours` |
| `quantity` | required positive int (bool rejected) |
| `estimated_grams` | optional, decimal > 0 |
| `requested_consumable_pool` | optional positive int |
| `no_filament_preference` | optional bool |
| `preferred_settings` | optional object (slicer settings) |
| `project_brief` | optional string |

Non-printer types must send an **empty** payload (`{}`), otherwise 400.

**Pool compatibility for printers**: pool material and colour must be in the accepted lists, and —
unless `no_filament_preference` is true — must equal the request's requested material/colour
(case-insensitive). Printer pools must use unit `grams`.

**Printer start requirements**: `estimated_minutes > 0` and both a consumable pool and planned grams.

### 2.3 Service file policies

A policy = (name, version, allowed_extensions, allowed_mimes, max_bytes). Two built-ins:

| policy | extensions | max size | used by |
|---|---|---|---|
| `documents` v1 (default per machine) | pdf, jpg, jpeg, png, webp, stl, 3mf, step, stp, obj, amf, ply, gcode, gco, iges, igs, dxf | 10 MB (`MACHINE_DOC_MAX_BYTES` = 10,485,760) | bucket requests on any machine; machine documents; maintenance log docs |
| `printer` v1 | model: stl, 3mf, step, stp, obj, amf, ply, gcode, gco, iges, igs, dxf + screenshots: png, jpg, jpeg, webp, pdf | 100 MB (`PRINT_UPLOAD_MAX_BYTES` = 104,857,600) | queue requests whose type config names it (the printer queue) |

Queue requests use the type's `capability_config.service_file_policy` (default `documents`). Bucket
requests use the machine's `service_file_policy`. The policy is snapshotted onto each staged file.
Warranty docs: pdf/jpeg/png/webp, 10 MB. Machine images: jpeg/png/webp, 10 MB, magic-byte sniffed.

### 2.4 `maker_file_formats` (validation rules, all of them)

1. **Extension** = lowercase suffix of the basename (backslashes normalised to `/`).
2. **Allowed pair**: (ext, declared MIME) is allowed iff ext ∈ policy extensions AND MIME ∈ policy MIMEs
   AND MIME is in the canonical table AND ext ∈ table[MIME]. Canonical table:

| MIME | extensions |
|---|---|
| application/pdf | pdf |
| image/jpeg | jpg, jpeg |
| image/png | png |
| image/webp | webp |
| application/octet-stream | stl, 3mf, step, stp, obj, amf, ply, gcode, gco, iges, igs, dxf |
| model/stl, application/sla, application/vnd.ms-pki.stl | stl |
| text/plain | stl, step, stp, obj, amf, ply, gcode, gco, iges, igs, dxf |
| model/3mf, application/vnd.ms-package.3dmanufacturing-3dmodel+xml, application/vnd.ms-3mfdocument | 3mf |
| application/step, model/step | step, stp |
| model/obj | obj |
| application/xml, text/xml, application/x-amf, model/amf | amf |
| application/x-ply, model/ply | ply |
| text/x.gcode, application/x-gcode | gcode, gco |
| application/iges, model/iges | iges, igs |
| image/vnd.dxf, application/dxf, application/x-dxf | dxf |

3. **Strict MIME by extension** for pdf/jpg/jpeg/png/webp: stored content-type must equal the strict
   MIME and the sniffed bytes must agree (`%PDF-` prefix, or image magic bytes).
4. If the file sniffs as PDF/image but the extension isn't one of those → rejected (polyglot guard).
5. **Signature check** on the first 8,192 bytes: `3mf` must start with ZIP magic `PK\x03\x04`; `step`/`stp`
   must contain `ISO-10303` (case-insensitive). All other model formats: no content check.
6. Public printer upload declaration: kind `stl` (any model format) requires an allowed pair against the
   printer model lists (missing content-type defaults to `application/octet-stream`); kind `screenshot`
   requires ext ∈ {png,jpg,jpeg,webp,pdf} and an exact ext↔MIME match.

No geometry parsing, no G-code header parsing, no 3MF metadata extraction exists.

### 2.5 Upload protocol (all private files)

Presign → client PUTs/POSTs directly to object storage → finalize.
- Presign creates the row first (staged), returns `{file_id, upload:{url, method, fields|headers}}`.
  Upload URL TTL 300 s (`EVIDENCE_URL_TTL_SECONDS`/`PRINT_URL_TTL_SECONDS`). POST presign enforces
  `content-length-range 1..max_bytes` and exact Content-Type.
- With PUT presign, the client writes to `staging/<key>`; finalize copies staging→final exactly once
  (the final key is never client-writable), re-checks size, deletes staging.
- Finalize re-validates size, ext/MIME pair against the **stored** content type, sniff/signature;
  on any failure it deletes the uploaded objects. Only the uploading user may finalize; an already
  attached file cannot be re-finalized; makerspace/queue/machine of file and request must match.
- Storage quota: bytes are charged to the makerspace on attach and freed on delete.
- Staged files can be deleted; attached files cannot.
- Read access: short-lived presigned GET (300 s).
- Public printer flow: up to N files uploaded with **concurrency 3** in the browser, then
  `file_ids` passed on submit; every id must be the actor's own, staged in the same queue, unattached.

---

## 3. Job / service request lifecycle

### 3.1 States and transitions

```
pending ──accept──▶ accepted ──start──▶ in_progress ──complete──▶ completed ──collect──▶ collected
   │                                         │
   └──reject──▶ rejected                     └──fail──▶ failed

reprint: from failed | completed | collected  ⇒ creates a NEW request in state `accepted`
```

Allowed edges (anything else → 409 `service_invalid_transition`):
`pending→{accepted, rejected}`, `accepted→{in_progress}`, `in_progress→{completed, failed}`,
`completed→{collected}`. Terminal: `rejected`, `failed`, `collected`.

**There is no cancel (by requester or staff), no un-reject, no pause, no edit of a submitted job.**
An accepted job can only progress. Public status maps `in_progress` → label `"printing"` for printer jobs.

Every transition: runs in a DB transaction, row-locks the request (and machine where relevant), checks
the `machine_service` module is enabled, checks the tenant write-fence, records an audit event
`machine_service.<event>` with meta `{request_id, status, estimated_minutes, actual_minutes, …}`, and
schedules notifications **after commit** (notification failure never breaks the workflow).

### 3.2 Submit

Two targets:
- **Machine (bucket)**: machine must be in this makerspace, `is_active` and **`status == idle` at
  submission time** (else 409 `service_machine_unavailable`). Default bucket "Service Requests" is
  get-or-created; `assigned_machine` is set immediately.
- **Queue**: queue must be active; its type must be global or same-tenant; `assigned_machine` stays NULL.

Also: validate `capability_payload` against the type (§2.2); quotas checked —
`machine_service_open` (count of pending+accepted+in_progress per makerspace; managed default 100),
`machine_service_submit` (requests created today, UTC; managed default 100), and for the public printer
path `print` (printer-queue requests this calendar month, UTC; managed default 200). Self-host = unlimited.
Strings trimmed. Status `pending`. Audit `machine_service.submitted`. Notify `submitted`.

Who can submit:
1. **Public generic endpoint** (`POST /public/<slug>/machine-service-requests`, body `machine_id`, `title`,
   `description`, `source_link`, `capability_payload`) — always targets a specific machine.
2. **Public printer endpoint** (§3.8) — always targets a printer queue.
3. **Staff on behalf of a member** (`POST /admin/makerspaces/<id>/machine-service/requests`, body
   `requester_id` (active member), `machine_id` (must be in staff's machine scope), title, …, optional
   overrides for requester_name/contact_email/contact_phone). Requires `manage_machines`.

Public requester identity (both public endpoints): makerspace must be public and have the module.
Depending on the makerspace's single `public_request_mode`:
- **authenticated member** — if the `membership` module is on: active membership + waiver accepted +
  presence (check-in) requirements; if off: just an active account;
- **account-less / checked-in mode** — a typed `name` + `checkin_mid` matched against an upstream
  check-in roster mints a stable "walk-in" principal user (presence filter, not authentication).
Requester name/email/phone are copied from the resolved account. A filled honeypot field `website`
returns a fake `201 {public_token: random, status: "pending"}` without creating anything.
Throttles: `public_request_submit` / `print_request_submit` (10/min), per check-in id throttles too.

Response to requester: `{public_token, status}`.

### 3.3 Accept (staff, `manage_machines` in scope)

Input: `estimated_minutes?` (int ≥ 0), `planned_grams?` (dec ≥ 0), `note?`.
Sets estimated minutes; planned grams (also writes/removes `capability_payload.estimated_grams`);
`reason = note` if given; `status=accepted`, `accepted_by`, `accepted_at`, `handled_by`.
UI: generic types ask only estimated minutes; the printer console also asks planned grams.

### 3.4 Reject

Input: `reason` (required, non-blank). Only from `pending`. Sets reason, status, handled_by.

### 3.5 Start

Input: `machine_id?`, `estimated_minutes?`, `consumable_pool_id?`, exactly one of
`planned_grams?` (≥ 0.01) / `planned_quantity?` (≥ 0.01).

Machine selection (candidates are **pre-filtered by the actor's machine scope** — scope constrains the
candidate set, not the winner):
- queue + no machine_id + policy `first_idle` → lowest-id active idle machine of the queue's type in the
  makerspace; none → 409.
- no machine_id otherwise → 409 "A machine is required".
- machine_id given → must be in scope, same makerspace, same type as the queue (if queue), active and idle.

Queue capacity: if `capacity` set and count of `in_progress` in that queue ≥ capacity → 409.
Printer: estimated_minutes > 0 and pool + planned grams required.
If any of pool/planned is supplied: pool **and exactly one** planned value required → reserve (§6.2).
Then: `assigned_machine`, `status=in_progress`, `started_at`, run-sheet snapshot (machine name, printer
model from `type_payload.model`, estimated minutes, planned grams, pool label/material/colour).
**Machine status → `running`.** Audit `machine_service.assigned` (meta machine_id) + `machine_service.started`.

### 3.6 Complete

Input: `actual_minutes` (int ≥ 0, required), `actual_grams?` / `actual_quantity?`, `consumptions[]`
(`{machine_consumable_id, quantity ≥ 0.01}`).
1. Lock the assigned machine (must exist).
2. Debit linked per-machine consumables (§6.4) with outcome `completed`.
3. If a pool was reserved: reconcile with `actual = actual_grams ?? planned_grams` (or `actual_quantity`
   for non-weight units, default = reserved quantity).
4. `status=completed`, `completed_at`, `actual_minutes`.
5. **Machine status `running → idle`** (only if it is still `running`).
6. Audit + notify `completed`.
7. Payment (never blocks completion — every failure swallowed): see §5.2.

### 3.7 Fail

Input: `reason` (required), `percent_complete` 0..100, `actual_minutes`, `consumptions[]`,
`actual_grams?`/`actual_quantity?`.
Debit consumptions with outcome `failed`. If a pool was reserved, reconcile with default actual =
- weight: `planned_grams × percent_complete / 100`
- other units: `reserved_quantity × percent_complete / 100`
(explicit actual overrides). Sets `fail_percent_complete`, `reason`, `failed_at`, status `failed`;
machine `running → idle`. **No payment is raised for failed jobs.**

### 3.8 Collect / record manual payment / reprint

- **Collect** (`completed → collected`): requires `collect_service_request` (front-desk action; implied
  by `manage_machines`). Sets collected_by/at. **Backend does not require payment first**; the staff UI
  shows only "Record payment · CUR amount" while a pending payment exists and only offers "Collect" after.
- **Record manual payment**: finds the job's `pending` Payment and marks it `paid_offline` through the
  reconciliation service (needs payment authority — see §5.5). No pending payment → 409. Audit
  `machine_service.manual_payment_recorded`.
- **Reprint** (`manage_machines`): from `failed`, `completed`, `collected`. Creates a new request copying
  bucket/queue, requester/member, contact snapshot, title, description, source_link, capability_payload,
  estimated_minutes, planned_grams; `status=accepted`, accepted_by/at = actor; `assigned_machine` copied
  only for bucket requests; `reprint_of = original.reprint_of or original` (always the root). Files are
  **not copied** (they stay on the root). Audit `machine_service.reprint_created`. Gotcha: **no
  notification is sent** although a staff "reprinted" email template exists. UI only offers Reprint on
  `failed` jobs in the printer console.

### 3.9 Queue position (member-safe)

Waiting statuses = `pending`, `accepted`. Scope = the request's bucket or queue. Ordering:
**accepted before pending**, then `created_at`, then `id`.

For each waiting request:
- `position` = (accepted ahead) + (pending ahead) + 1
- `approved_ahead` = accepted rows ahead
- `awaiting_review_ahead` = pending rows ahead, **only reported if this request is itself pending** (else 0)

Non-waiting requests have no position (null). UI copy: "#N in the queue"; detail "You're next in line"
when both ahead-counts are 0, else "X approved jobs ahead / Y awaiting review". In-progress jobs show
"~Hh Mm left" = started_at + estimated_minutes − now (ticks every 30 s; "Finishing up - past the
estimate" when overdue).

### 3.10 Public status lookup (printer jobs only)

`GET /public/machine-service/3d-printer/requests/<public_token>/status`, unauthenticated, throttled.
404 unless the token belongs to a request in a **printer queue** of a servable makerspace with
`printing` enabled. Field allowlist (no PII): `public_token, status (in_progress→"printing"), title,
created_at, accepted_at, started_at, completed_at, estimated_minutes, queue_position,
queue_approved_ahead, queue_awaiting_review_ahead`. Status link format sent by email:
`<PUBLIC_APP_BASE_URL>/m/<slug>/print?token=<public_token>`; the page also remembers the last token in
localStorage (`tinkerspace.printStatus.<slug>`) and polls: 90 s while pending/accepted, 30 s while in progress.

Gotcha: frontend polls/steps on `"in_progress"` but the API returns `"printing"`, so the stepper and
countdown never light up during printing. Pick one value in the port.

There is **no status page for non-printer jobs**; members see them in the member area (§10).

### 3.11 Notifications per event

Two channels, both fail-safe and post-commit:

1. **In-app staff notification** for every event of every type: event `machine_service.<event>`,
   title "Machine service request updated", body "Machine service request #<id> <event>. Status: <status>.",
   link `/admin/machine-service/requests/<id>`.
2. **Printer jobs only** (type = global 3d_printer): the "printing" email stream, also fanned out to chat
   destinations (Telegram/Slack/Discord/Mattermost) through the notification matrix with per-event mute.
   - **Requester email** for `submitted`, `accepted`, `started`, `rejected`, `completed` to
     `contact_email` (fallback account email). Default subjects:
     submitted "We received your makerspace print request"; accepted "…was accepted"; started
     "…is now printing"; rejected "…was rejected"; completed "…is ready to collect". Body includes
     title, queue name, makerspace, tracking link + token, reason when relevant.
   - **Staff email** for `submitted, accepted, started, completed, rejected, failed, collected,
     (reprinted — never actually emitted)` to recipients resolved by staff recipient rules
     (feature `printing`, per event, optionally narrowed by machine/type scope; uncovered subjects fall
     back to action-based default — fails OPEN). Subject "<Makerspace> print request #<id> <event>".
     Text body: status, title, requester, email, phone, material, colour, quantity, reason.
   - Templates are overridable per makerspace and per machine type (`MachineTypeEmailTemplate`:
     stream, audience requester|staff, key, subject, text, html, is_active).

Gotcha: **non-printer jobs send no requester email at all** — only the in-app staff notice. The port
should generalise requester emails to all types.

---

## 4. Pricing

Single mode: **per-unit rate × metered quantity + flat fee**, per (makerspace × machine type).

```
pricing = MakerspaceMachineTypePricing(makerspace, assigned_machine.machine_type, payment_enabled=true)
if job.assigned_machine is null or pricing missing → 0.00
qty = effective_quantity(job, type):
        if type.capability_config.metering_unit == "minutes": actual_minutes
        elif actual_consumed_quantity is not null:              actual_consumed_quantity
        else:                                                   actual_consumed_grams
amount = rate_per_unit × qty + flat_fee
if amount ≤ 0 → 0.00 (no charge)
else amount quantized to 0.01 (Decimal default rounding, half-even)
```

- Price is computed **only at completion** (final price). There is **no quote** shown to the requester
  before or at acceptance; estimated minutes / planned grams are not priced anywhere.
- Note for printers: qty = actual grams (from reconciliation), not minutes; and `quantity` (number of
  copies) in the payload is **not** a multiplier — staff enter total grams.
- No minimum charge (beyond flat fee), no rounding of quantity, no tiers, no member/non-member rates,
  no discounts, no taxes/GST, no currency conversion.
- Currency = makerspace `default_currency` (lowercase ISO-4217, default `usd`) snapshotted on Payment.
- Failed and rejected jobs are never charged. Reprints are charged independently when they complete.
- Minor units for providers: `int(amount × 100)` (assumes 2-decimal currencies).
- Stripe Connect platform fee: `round_half_up(round_half_up(amount×100) × bps / 10000)` minor units.
- Pricing UI: "Machine types and pricing" section (Space Manager only): per type "Rate per unit (CUR)",
  "Flat fee (CUR)", "Enable payment" checkbox; list endpoint returns `{currency, results:[{machine_type_id,
  rate_per_unit, flat_fee, payment_enabled}]}` including unsaved zero rows for every applicable type.

---

## 5. Payments for machine jobs

### 5.1 Online availability

`online_payments_enabled(ms, "machines")` = module `payments` ON AND feature `payments.enabled` AND
feature `payments.machines` AND a payment source resolves. Source resolution:
- provider `razorpay` → needs key_id + key_secret + webhook_secret.
- provider `stripe` → raw keys (secret + webhook secret) if set; else (managed hosting only) an ACTIVE
  Stripe Connect account with charges enabled + configured platform keys (with application fee bps).
- Self-host never falls back to platform Connect. Blank creds fail closed.

New Payment rows additionally require the `payments` module ON, re-checked under a makerspace row lock.

### 5.2 Charge creation at completion (never-block)

After `complete()` commits its state change, inside guarded try/except:

1. **Counter-settlement regime** if (requester is a check-in walk-in principal for this makerspace) OR
   online payments are not enabled → create a **pending offline Payment** (`amount = compute_amount`;
   skipped if ≤ 0 or if `payments` module off; idempotent: returns the existing row for the subject;
   unique-constraint races resolved by re-reading). Staff later mark it `paid_offline` at the desk.
2. Otherwise **online regime**: require pricing row with payment_enabled and amount > 0 → create
   pending Payment stamped with provider/stripe_provider/connected account/fee (immutable thereafter),
   member = job.member or requester, no subject_label → after commit, best-effort create checkout.

If anything fails, the job is still completed; a checkout can be generated later on demand.

### 5.3 Checkout creation (idempotent)

Lock order: platform settings (Connect only) → makerspace settings → Payment. Only for `pending`.
If a checkout URL already exists, return it (never mint a second live link). Rail claimed = `checkout`
(conflict 409 if already native PaymentIntent). Return URL = the member area
(`https://<verified custom domain>/member` or `<base>/m/<slug>/member`) with `?checkout=success|cancelled`.
Line item name = subject label (job title via live lookup; never blank).

- **Stripe Checkout Session**: `mode=payment`, `client_reference_id=payment.id`,
  `metadata={payment_id, makerspace_id}`, one line item `{currency, unit_amount=int(amount×100), name}`,
  Connect adds `payment_intent_data.application_fee_amount`. Idempotency key
  `payment-checkout-<id>-<generation>` where generation = µs timestamp of last session expiry (0 initially),
  so an expired session can be replaced.
- **Razorpay Payment Link** (POST `/v1/payment_links`, Basic auth key_id:secret, 15 s timeout):
  `amount` minor, `currency` UPPERCASE, `description` (≤ 2048), `reference_id = payment.id`,
  `callback_url = success_url`, `callback_method=get`, `notes = metadata` (stringified),
  `notify {sms:false, email:false}`, `reminder_enable:false`. Stores `id` → `external_order_id`,
  `short_url` → `checkout_url`. Self-host/own-account only (no Connect equivalent).

Member endpoint `POST /member/makerspaces/<id>/payments/<pid>/checkout` → `{checkout_url}`; 404 if not the
caller's pending payment, 409 rail conflict, 503 provider unavailable. Member history lists the caller's
payments with "Pay now" when a URL exists. (A native mobile PaymentIntent rail also exists.)

### 5.4 Webhooks (signature, idempotency, settlement)

Endpoints (unauthenticated): `/api/v1/webhooks/stripe/<public_code>`, `/api/v1/webhooks/razorpay/<public_code>`,
`/api/v1/webhooks/stripe/connect` (platform). The public code only addresses the tenant; the
**per-makerspace secret** authenticates. Archived (not purged) makerspaces still settle.

- **Stripe**: verify `Stripe-Signature` over the raw body with the makerspace webhook secret (Stripe SDK
  `construct_event`). Handled types: `checkout.session.completed` (only if `payment_status` is `paid`/absent),
  `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded`.
  Match Payment by session id or payment_intent id within the makerspace + stripe_provider (+ connected
  account for Connect). Unknown payment → ignore (no idempotency row).
- **Razorpay**: HMAC-SHA256(webhook_secret, raw body) hex compared constant-time to `X-Razorpay-Signature`.
  Paid events = `payment_link.paid`, `order.paid`, `payment.captured` (`payment.authorized` is NOT paid).
  Event id = `X-Razorpay-Event-Id` header, fallback `"<event>:<entity id>"`. Match by `external_order_id`
  (link/order id) or `external_payment_id`. Non-paid events are not recorded. Always 200 after verification.
- **Idempotency**: insert `(makerspace, provider, event_id)` into ProcessedStripeEvent inside the
  settlement transaction; duplicate → no-op.
- **Settlement**: row-locked; `pending → paid_online` (store intent/payment id); audit `payment.paid_online`.
  Settles **regardless of feature toggles/module state** (money already taken must not be stranded).
- **Expired session** (Stripe): clears session id/url, sets `stripe_checkout_session_expired_at`, audit
  `payment.checkout_expired`; next checkout call mints a new session.
- **Paid after terminal**: if status was `waived` → promote to `paid_online` (the one allowed terminal
  mutation); if `paid_offline` → keep, audit `payment.paid_after_terminal` +
  `payment.double_paid_refund_required` (manual refund outside the system); always audit
  `payment.paid_after_terminal`.

### 5.5 Offline / reconciliation

Staff actions on pending payments: **mark offline** (`paid_offline`) and **waive** (`waived`), single or bulk
(`/admin/makerspace/<id>/payments/...`, also `/admin/machine-service/payments/<pk>/mark-offline|waive`).
Batch is all-or-nothing: lock all, 404 if any missing, 403 if actor lacks authority, 409
`payment_terminal` listing non-pending ids. Each reconciled row best-effort expires its live online
rail (Stripe session expire / Razorpay link cancel / PaymentIntent cancel). Audit `payment.paid_offline`
/ `payment.waived` with actor.

Authority for machine-job payments: `manage_machines` in the makerspace **and** the job must be within the
actor's machine scope. Jobs whose request row was purged ("orphans") are actionable only by
scope-exempt actors (space manager, superadmin, legacy null-role membership). Listing all payments needs
`manage_makerspace`. A collect-only desk role can collect but needs payment authority to record cash.

Amount visibility: amounts are staff-only; requesters/members see status + their own checkout link.

---

## 6. Consumables

### 6.1 Pool scoping and visibility

- Usable by a machine iff same makerspace AND (pool.machine = machine OR (no machine AND pool.type = machine.type)
  OR (no machine AND no type = shared)).
- Staff visibility: machine/type-bound pools follow the actor's machine scope; **shared pools are visible
  to every `manage_machines` holder** in the space.
- Public print form lists pools that serve printers (type = printer, bound to a printer, or shared),
  active, `is_public`, `remaining > 0`, unit grams; shows only `{id, material, color}` (no quantities).
- Units: grams | milliliters | millimeters | count; job's metering unit must map to the pool unit.

### 6.2 Reservation (at job start)

Requires active pool, compatible with the machine and the request's makerspace, printer material/colour
match (§2.2), quantity > 0, nothing already reserved on this job. Writes ledger `reserve` delta
`−planned`; pool `remaining −= planned` (400 "Only X <unit> remain." if insufficient); job stores
`run_consumable_pool`, `metering_unit`, planned/reserved quantity (and grams mirrors when weight).
Stock is debited **at start**, not at submit.

### 6.3 Reconciliation (at complete/fail)

`delta = reserved − actual`; if ≠ 0, ledger `reconcile` with that delta (returns unused stock, or takes
more if actual > reserved — fails 400 if not enough remains, or if it would exceed `initial`). Job:
`actual_consumed_* = actual`, `reserved_* = 0`.

Other pool operations: **correction** (signed delta ≠ 0, reason required; cannot go < 0 or > initial),
**retire** (reason required; ledger `retire` for the full remaining, then `is_active=false` — service
exists but **no endpoint/UI**), **visibility toggle** (`is_public`), **manual** (typed manual usage
debit, §7.1). `initial` is immutable; refills = create a new pool (procurement "move received item to
spool" creates one).

### 6.4 Per-machine linked consumables (`MachineConsumable`)

- Link (manage): count mode → pick a same-tenant, non-archived, quantity-tracked inventory product (stock
  is the inventory product's available quantity); grams mode → label + starting grams.
- Log consumption (operate): count → whole numbers, debits inventory availability (`consume_available`,
  400 on insufficient stock); grams → `remaining −= qty`.
- At job complete/fail, staff may submit `consumptions[]` against consumables **linked to the assigned
  machine**; each consumable at most once per job; recorded as append-only ServiceRequestConsumption rows
  with outcome. Audit `machine_service.consumption_recorded`.
- `low_threshold` only drives a "Low" badge in the UI.

### 6.5 Low-stock alert → auto restock

After any negative pool adjustment: if the `procurement` app is active, pool active, `low_threshold > 0`
and `remaining ≤ threshold` → under an advisory lock keyed (makerspace, crc32(name)) create at most one
open To-Buy item per pool (`kind=printing`, name `"Filament restock: <material> <color>"`, qty 1, status
`requested`, machine_type = pool type or bound machine's type, `source_pool` = pool). "Open" = requested |
approved | ordered. Audit `procurement.low_stock_flagged`. Fail-safe (exceptions swallowed). No email.
UI shows "Low stock" chip when remaining ≤ threshold.

---

## 7. Metering, maintenance, faults, warranty, reports

### 7.1 Usage metering

- **Manual hours** (operate): `hours > 0` + note → MachineUsageEntry(source=manual). Audit `machine.usage_logged`.
- **Typed manual usage** ("log a run that happened outside the queue", manage_machines in scope):
  `machine_id`, `duration_minutes` ≥ 0, `outcome` success|failed (failed requires reason),
  `percent_complete` 0..100 (default 100), `grams`/`quantity`, `metering_unit`, optional pool (required if
  quantity > 0; must serve machine; unit must match), optional `service_request_id` (must be compatible
  with the machine and in scope), note.
  `hours = round(duration_minutes × percent_complete / 6000, 2)`. Debits pool via ledger `manual`.
  Audit `machine.typed_usage_logged`.
- **Machine `usage_hours` = sum of usage entries only. Completing a queued job does NOT add a usage entry**
  — job time lives in `actual_minutes`. Reports/public stats add the two together where relevant.

### 7.2 Machine status / downtime

Operators set any status (idle/running/reserved/maintenance/offline) except on retired machines; audit
`machine.status_changed {old,new}`. Only `idle` + active machines can accept a bucket submission or be
started. Retire (admin/type-manager/full operator): `is_active=false`, status `offline`, audit
`machine.retired`. Unretire (admin/type-manager only): re-checks module + machine quota (managed default 5).

### 7.3 Faults

`MachineErrorLog` entries by operators: severity info|warning|error|critical + message. Audit
`machine.error_logged`. No linkage to maintenance or status; no notifications.

### 7.4 Maintenance

- **Schedules** (manage): create {description, interval_days > 0, next_due date}; update the same three
  (only while active); deactivate (idempotent). Time-based only — **no usage-based (hours/jobs) triggers**.
- **Log maintenance** (operate): {summary, performed_at? (tz-aware, default now), cost? (≥ 0, ≤ 10 int
  digits + 2 dp), parts_note?, set_idle?}. `set_idle` requires machine currently `maintenance`
  (else 409) and flips it to `idle` (audited as status change).
- **Complete a due schedule** (manage; same log body + `schedule_id`): appends the log and advances
  `next_due = old next_due + interval_days` (from the old due date, not today). Inactive → 409.
- Retired machines reject maintenance (409). Archived makerspaces → 403.
- Log attachments: presign/finalize/url/delete (docs policy, 10 MB; operate to add, manage to delete).
- Notifications (staff email + chat, scoped by machine so per-machine/per-type recipient rules apply):
  events `logged`, `schedule_created`, `schedule_updated`, `schedule_deactivated`, `schedule_completed`.
  Subject "<Makerspace> maintenance <event>: <machine name>".
- **No overdue reminder job exists** — overdue is computed on read (schedule `overdue` flag, dashboard,
  reports). The port should add a daily "due/overdue" notifier.
- Audits: `maintenance.logged`, `maintenance.schedule_created|updated|deactivated|completed`,
  `maintenance.document_added|deleted`.

### 7.5 Machine documents & images

Documents (manage): manual|sop, docs policy, presign → attach → presigned URL → delete. Audit
`machine.document_added|removed`. Image (manage): public-image bucket, jpeg/png/webp 10 MB, key must be
under `machine/<ms>/`, one key cannot be used by two machines, magic-byte validated; old image released on change.

### 7.6 Warranty

- One warranty per machine (upsert via PUT with any of purchased_on, warranty_expires_on, vendor_name,
  vendor_contact). Machine warranties need `can_manage_machine` + `machines` module. Audit
  `warranty.created|updated`.
- Status (computed against local date): `unknown` (no expiry date / no warranty), `expired`
  (expires < today), `expiring_soon` (expires ≤ today + 30 days), `active`.
- Documents: pdf/jpeg/png/webp up to 10 MB, presign/finalize/url/delete.
- Report `GET /admin/makerspace/<id>/warranties?status=&missing_docs=&expires_before=` — rows
  `{host_kind (asset|machine), host_id, host_label, serial_number, vendor_name, purchased_on,
  warranty_expires_on, status, document_count}`; machine rows only for machines the actor can manage
  (admins, type managers, manage/full operators — not operate-only). Paginated. No expiry notifications.

### 7.7 Reports (registry: JSON + CSV/XLSX export; optional date range `start`/`end` YYYY-MM-DD, end inclusive)

- **machine-service** (module `machine_service`; also requires `reports`), four sections:
  - `status_totals`: counts of requests **created in range** — submitted, accepted, in_progress,
    completed, collected, rejected, failed (by current status).
  - `machines` (per machine with any assigned job): request_count (created in range), completed_count
    (completed/collected with completed_at in range), failed_count (failed_at in range),
    completed_hours = Σactual_minutes/60, failed_partial_hours = Σ(estimated_minutes × fail% / 100)/60,
    total_recorded_service_hours, failure_rate = failed/(completed+failed)×100 (2 dp, null if 0).
  - `consumption`: per machine × measurement × product/label — completed_amount, failed_partial_amount,
    total_used (ServiceRequestConsumption windowed by the job's completed_at/failed_at).
  - `failure_summary`: per machine with failures — failed_count, failed_partial_hours,
    failed_count_amount, failed_grams_amount.
- **printer-service** (`?machine_type=3d_printer`; module `printing`): per printer — model,
  completed_hours, failed_partial_hours (uses **actual** minutes × fail%), manual_hours (typed manual),
  consumed_grams, payment_due (pending Payments + legacy pending), payment_paid (paid_online/offline +
  legacy paid).
- **machine-usage**: per machine — machine_type, is_active, usage_entries, usage_hours.
- **maintenance-activity**: per machine — log_count, costed_log_count, total_cost, average_cost (half-up),
  last_performed_at, average_interval_days = (last − first)/(logs − 1), active_schedules, overdue_schedules.
- **FabLab health**: machines_active, machines_usage_hours, maintenance_logs, maintenance_total_cost,
  maintenance_overdue_schedules (per makerspace).
- **payments** report (separate, all subjects).
- All per-makerspace reports are narrowed to the actor's machine scope; superadmin aggregate adds `makerspace_id`.
- Rounding: hours 2 dp; amounts quantized 0.01 half-up.

### 7.8 Dashboard counters (staff home)

`pending_prints`, `active_prints` (printer jobs, machine-scoped), `prints_awaiting_collection`
(completed printer jobs, follows **collection** authority), plus a `scope_mode: "machine"|"full"` flag.
Machine-only maintainers don't see non-machine counters.

### 7.9 Public stats (no PII)

- Machines: total usage hours of public active machines.
- Printing (needs `machine_service` + `printing`): hours_all_time (completed/collected actual minutes/60 +
  manual hours), hours_this_month, busiest_printer (by hours), per_printer {name, model, jobs, hours,
  grams, image_url}, grams_all_time, by_brand (pool brand or "Unbranded"), jobs.status_counts & queue
  counts (pending/accepted/printing), filament_trend by month (YYYY-MM).

---

## 8. 3D-printer hardware integration

**None present.** No OctoPrint/Moonraker/Klipper/PrusaLink/Bambu API clients, no job push, no telemetry,
no auto-status. `camera_feed_url` is a stored URL only; `firmware_version` free text; machine `status`
is set by humans or the workflow (`running` on start, `idle` on complete/fail). Estimates come from the
requester's slicer screenshots (uploaded as `screenshot` files) and staff-entered minutes/grams.

---

## 9. Invariants, permissions, audit

### 9.1 Tenancy

- Every query for staff is scoped to makerspaces the actor belongs to (active membership, not
  archived/hidden) — a missed scope is a cross-tenant leak. Foreign rows return 404, not 403.
- Machine types: global + own-tenant only; pricing, queues, pools must reference same-tenant or global types.
- Public endpoints resolve the makerspace by public slug/code and require the relevant module.

### 9.2 Roles and actions (relevant subset)

Seeded per-makerspace roles: Space Manager (`manage_makerspace` — exempt from all machine scoping),
Machine Manager (`manage_machines`), Inventory Manager (no machine/printing), Member. Custom roles are
action lists. Implications: `manage_machines` ⇒ `manage_printing` + `collect_service_request`.

Three authority tiers on a machine:
1. **In-scope `manage_machines`** — the role's linked types ∪ linked machines (union). **No links ⇒ no
   machines (fail closed).** Exempt: roles with `manage_makerspace`, legacy null-role memberships,
   superadmin without membership. Default Machine Manager is auto-linked to all types on creation.
   Creating a machine needs a **type** link (a machine link doesn't authorise more of that kind).
2. **Type manager** — holds the type's `managing_action` **directly** (stored on the role, not implied):
   e.g. a dedicated Print Manager with `manage_printing` manages all printers.
3. **Per-machine operator** — operate (status, usage, faults, log consumption, maintenance logs),
   manage (+edit fields, documents, image, link consumables, schedules, warranty), full (+retire,
   delegate operators except `full`). Only tier 1/2 may assign `full` or unretire.

Capability matrix exposed per machine: `can_operate`, `can_edit`, `can_delegate`, `can_retire`,
`can_unretire` (UI must render from these, never infer).

Service requests:
- Lifecycle mutations (accept/reject/start/complete/fail/reprint/create/files): `manage_machines` and the
  job reachable through `assigned_machine`, `bucket.machine`, or type of assigned machine / bucket machine /
  queue (`_manage_queryset`).
- List/detail/collect: machine-scoped rows (all statuses) ∪ makerspace-wide `completed` rows when
  `collect_service_request` is granted **directly** (front-desk handover). Implied collect never widens.
- Pools: machine/type-bound follow scope; shared visible to all `manage_machines`.
- Types & pricing configuration: Space-Manager identity only.
- Publicity toggle: `manage_machines` + scope covers machine.
- Notification recipients "fail open"; access "fails closed" — deliberate asymmetry.
- Users must be active (not suspended/restricted) for any staff action; operator rows are re-validated live.

### 9.3 Data integrity rules worth keeping

- Status transitions only via the workflow service; DB-level guard against bulk status updates.
- Row locks: request → machine → pool; makerspace lock before role lock; payment lock order platform
  settings → makerspace settings → payment.
- Append-only: consumable adjustments, service consumptions, usage entries, maintenance logs, audit log;
  pools' `initial` immutable; attached file metadata immutable; terminal payments immutable (DB trigger).
- One Payment per (makerspace, subject); provider/rail provenance immutable.
- Run-sheet snapshot at start (machine name/model, pool label/material/colour, estimates) so history
  survives later edits.
- PII (requester name/email/phone) encrypted at rest and excluded from all public projections, reports
  and payment labels; module purge deletes usage entries derived from purged requests but keeps pools
  and Payments.
- Never-block: notifications, payment creation and checkout creation can never fail a job transition.
- Webhook settles regardless of toggles; reconciliation expires live checkout links.
- Quotas (managed hosting only): machines 5, open service requests 100, daily submissions 100, monthly
  print requests 200, storage 1 GiB.

### 9.4 Audit events (append-only `AuditLog(actor, action, makerspace, target, meta)`)

`machine.created|updated|status_changed|retired|unretired|usage_logged|typed_usage_logged|error_logged|
document_added|document_removed|image_updated|image_removed|publicity_changed|operator_assigned|
operator_updated|operator_removed|consumable_linked|consumable_unlinked|consumption_logged`,
`machine_type.created|updated`, `machine_type_pricing.set|updated`,
`machine_service.submitted|accepted|rejected|assigned|started|completed|failed|collected|
reprint_created|manual_payment_recorded|consumption_recorded|file_staged|file_attached|file_deleted`,
`machine_consumable_pool.created|reserve|reconcile|manual|correction|retire|retired|visibility_changed`,
`procurement.low_stock_flagged`, `maintenance.*` (§7.4), `warranty.created|updated`,
`payment.created|checkout_created|paid_online|paid_offline|waived|canceled|checkout_expired|
paid_after_terminal|double_paid_refund_required`, `role.machine_scope_changed`.

### 9.5 Error contract

`409 service_invalid_transition`, `409 service_machine_unavailable`, `400 service_insufficient_stock`,
`400 service_consumption_invalid`, `400 invalid_attachment`, `409 payment_terminal`,
`409 payment_rail_conflict`, `503 payments_unavailable`, maintenance: retired machine / inactive
schedule / status conflict → 409.

---

## 10. Frontend (screens and UX)

### Public (per makerspace: `/m/:slug/...`, or root paths on a custom domain)

- **Machines** `/machines` (module `machines` + public inventory enabled): header "Our machines" /
  "Equipment available in this makerspace, grouped by kind." Machines grouped by type (name + icon);
  card shows image, name, status badge, "N h logged". Allowlist projection: name, type{name,icon},
  image_url, status, usage_hours. Empty: "No machines listed — This makerspace has not published any
  machines yet." Staff can preview the public card from the machine drawer.
- **3D print request** `/print` (module `printing`; needs ≥ 1 active printer queue): two columns — form
  and "Print status" aside.
  - Form "Print details — Tell staff what to print. Files upload when you submit.": Title (required),
    Project brief, "Slicer settings / personal preferences", "Filament / material" dropdown of public
    pools (empty state: "No filament currently available — You can still submit without a preference,
    and staff will confirm the options."), Quantity (≥ 1), "Estimated filament (g)" ("If you know it from
    your slicer. Staff can adjust this."), Source link, "Model, CAD, or toolpath files" (accept list of
    model extensions), "Estimated print-time screenshots (Bambu Lab)" (images/PDF), hidden honeypot.
    Check-in mode adds an identity step (type name → match roster) before submit.
  - Submit uploads files (concurrency 3, progress text), then submits with the first queue's id.
  - Status panel: stepper Requested → Accepted → Printing → Ready to collect → Collected; rejected/failed
    shows a danger callout "<title> is <status>."; queue position card; time-left chip; token remembered.
  - Unavailable state: "Printer service is not currently available. Check back later, or browse the
    inventory in the meantime." (still shows a remembered token's status). Load error state too.
- **Stats** `/stats`: Printing section (busiest printer, filament by brand, monthly filament bar chart,
  per-printer table) and machine usage hours.
- **No public UI for generic (non-printer) machine service requests** even though the API exists.

### Member area `/member`

Activity lists "printer requests" and "other service requests" (title, status, created, "Queue N"),
and Payments (amount, status, "Pay now" → hosted checkout; return `?checkout=success|cancelled`);
archived-space payments discoverable at `/member/archived`.

### Staff console (`/admin/...`)

- **Machines tab** `/admin/machines` → index of **machine-type cards** (name, "N machines", highlights
  "N running" / "N in maintenance" / "N offline"); counts only after the full machine list (all pages)
  loaded. Empty: "No machine types available — …Ask a space manager to add a type or give your role
  access to one." Single reachable type renders inline (no redirect).
  - **Type page** `/admin/machines/<typeId>-<slug>` (id authoritative): status filter; machine table
    ("No machines yet" / "Nothing to show — No machines match the selected status."); create machine
    (type selector limited to types with `can_create_machine`; printer adds "model"); then the
    **service console**:
    - Generic `MachineServiceConsole`: "Service queue" ("This type is metered in <unit>…"), job cards
      with title, status chip, payment chip ("Payment owed CUR x" / "paid" / "waived" / "canceled" /
      "free" — hidden when payments module off and free), meta "Planned X unit · actual Y unit", context
      actions (pending: Accept / Reject…; accepted: Start; in_progress: Complete / Fail…; completed with
      pending payment: "Record payment · CUR amount"; completed: Collect), inline action forms (start: machine
      dropdown "Any idle machine", pool dropdown filtered to shared + machine-bound pools of the chosen
      machine, estimated minutes, planned qty; complete/fail: actual minutes, actual qty, percent, reason).
      Empty: "The queue is clear — New service requests show up here." Plus "Manual usage" form + list.
    - `PrinterServiceConsole` (global printer only): "3D-printer queue — Accept jobs, reserve filament,
      start work, reconcile actual grams, then complete, fail, collect or reprint."; accept also asks
      planned grams; Reprint on failed; "Manual usage — Log a print that happened outside the queue";
      "Printer reports — Hours and filament per printer" cards (empty: "No completed printer activity yet").
    - Drafts persist per type across navigation and reset after a successful action; every action
      invalidates requests, manual usage, handover list, reports, pools and the machine list.
  - **Machine drawer** tabs: Overview (status dropdown + "Set status", name, location, firmware, camera
    URL, notes, photo, retire/reactivate with confirm), Usage (manual hours log + history), Maintenance
    (schedules list with Overdue/Scheduled/Inactive chips, "Every (days)", "Next due"; log form with
    "Set machine status to idle"; history with attachments), Consumables (link inventory product or grams
    label; log use; Low badge), Documents (manual/SOP), Errors (severity log), Operators (assign
    operate/manage/full), Warranty (dates, vendor, docs, status badge). Tabs shown per capability/module.
  - **Shared consumables section**: create pools (material, colour + hex swatch picker, brand, lot,
    unit, quantity, low threshold, bind to machine or type or shared, public toggle), corrections,
    visibility toggle, Low stock chip.
  - **Machine types & pricing** (Space Manager): create custom type (slug "can't change later", name,
    icon, metering unit, requires booking, materials/colours presets), edit, pricing per type.
- **Handover tab** ("Awaiting collection"): completed jobs table (Job, Finished, Payment) with
  "Record payment" then "Collect"; empty "Nothing is waiting to be handed over. Jobs appear here as soon as
  they are marked complete."
- **Payments tab**: list/filter all payments, mark offline / waive (single + bulk), payment settings
  (provider Stripe/Razorpay, keys, currency, Connect onboarding).
- **Warranty tab**: table with status filter chips, "Expires before", missing-docs filter; empty "No warranties".
- **Reports**: Machine service, Machine usage, Maintenance, Printer service, Payments (charts + CSV/XLSX).
- **Role editor → Machine scope**: tick machine types and/or individual machines per role (replace on
  save; unknown ids rejected; inert for exempt roles).
- **Dashboard tiles**: pending prints, active prints, awaiting collection.

---

## 11. Gotchas / recommendations for the port

1. No ServiceQueue CRUD — add it (name, type, description, capacity, allocation policy, active).
2. No requester cancellation and no staff cancel of accepted jobs — consider `pending|accepted → cancelled`
   with reservation release.
3. Requester emails exist only for printer jobs; generic jobs only notify staff in-app.
4. Reprint emits no notification; reprint files are not copied.
5. Public status `printing` vs frontend `in_progress` mismatch.
6. Capability flags (`requires_booking`, etc.) are unenforced.
7. Job minutes never feed `Machine.usage_hours`; usage reports mix two sources.
8. No quote/estimate price before completion; no taxes; no member pricing; amount×100 assumes 2-dp currencies.
9. Collect is not gated on payment server-side (UI-only ordering).
10. Bucket (per-machine) submissions require the machine to be idle at submit time — surprising for
    users; queues avoid this.
11. Pool `retire` has a service but no endpoint; pool "grams" field names hold any unit.
12. No overdue-maintenance or warranty-expiry reminders; no usage-based maintenance.
13. Legacy `payment_amount/payment_status/paid_at` columns on requests are read-only history; reports
    still sum them for jobs without a Payment row.
