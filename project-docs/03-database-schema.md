# Database Schema (Postgres)

All tables below are created in V1. Tables marked "(dormant)" exist with correct structure but are not populated beyond a default row, or have no feature logic/UI built on top yet — this avoids breaking migrations when those features are added later.

All production migrations also declare `NOT NULL`, foreign-key actions, status `CHECK` constraints, and indexes implied below. Foreign keys to historical entities use `ON DELETE RESTRICT`/`NO ACTION`, never `CASCADE`.

## Identity & Access

```
users
  id              uuid PK
  email           text                  -- unique case-insensitively for active accounts
  password_hash   text
  phone_e164      text nullable
  phone_verified_at timestamptz nullable
  sms_consent_at  timestamptz nullable
  sms_opted_out_at timestamptz nullable
  account_type    text        -- player | owner | staff | admin
  status          text        -- active | suspended | deleted
  token_version   int         -- bump to force logout everywhere
  email_verified_at timestamptz nullable
  deleted_at      timestamptz nullable
  anonymized_at   timestamptz nullable
  created_at      timestamptz

password_reset_tokens
  id              uuid PK
  user_id         uuid FK -> users.id
  token_hash      text
  expires_at      timestamptz
  used_at         timestamptz nullable
  created_at      timestamptz

organizations
  id              uuid PK
  owner_user_id   uuid FK -> users.id
  name            text
  payment_provider text nullable
  provider_account_ref text nullable  -- connected/settlement account identifier
  kyc_status      text        -- not_started | pending | verified | rejected
  payout_eligibility_status text -- ineligible | pending | eligible | suspended
  settlement_currency char(3) nullable
  deleted_at      timestamptz nullable
  created_at      timestamptz
  UNIQUE (payment_provider, provider_account_ref)

roles
  id              uuid PK
  name            text
  organization_id uuid FK -> organizations.id, nullable  -- null = system role
  is_system_role  boolean
  deleted_at      timestamptz nullable  -- custom roles only; system roles immutable

permissions
  id              uuid PK
  key             text unique   -- e.g. 'booking:cancel_any'
  description     text
  is_platform_only boolean

role_permissions
  role_id         uuid FK -> roles.id
  permission_id   uuid FK -> permissions.id
  PK (role_id, permission_id)

user_role_assignments
  id              uuid PK
  user_id         uuid FK -> users.id
  role_id         uuid FK -> roles.id
  scope_type      text        -- 'global' | 'organization' | 'facility' | 'resource'
  scope_id        uuid nullable
  granted_by      uuid FK -> users.id
  created_at      timestamptz
  revoked_at      timestamptz nullable

staff_invites
  id              uuid PK
  organization_id uuid FK -> organizations.id
  role_id         uuid FK -> roles.id
  scope_type      text        -- 'organization' | 'facility' | 'resource'
  scope_id        uuid nullable
  email           text
  token_hash      text
  expires_at      timestamptz
  used_at         timestamptz nullable

refresh_tokens
  id              uuid PK
  user_id         uuid FK -> users.id
  family_id       uuid        -- shared by every refresh token in rotation family
  token_hash      text
  created_at      timestamptz
  expires_at      timestamptz
  revoked_at      timestamptz nullable
```

## Facility & Resource

```
facilities
  id              uuid PK
  organization_id uuid FK -> organizations.id
  name            text
  address         text
  timezone        text        -- IANA name, e.g. Asia/Karachi
  location        geography(Point, 4326)  -- GiST indexed; replaces separate lat/lng
  amenities_json  jsonb
  images_json     jsonb
  status          text        -- pending | approved | suspended
  deleted_at      timestamptz nullable

cancellation_policy_versions
  id              uuid PK
  facility_id     uuid FK -> facilities.id
  rules_json      jsonb       -- cutoff, fee/refund, no-show rules
  valid_from      timestamptz
  valid_to        timestamptz nullable
  created_by      uuid FK -> users.id
  created_at      timestamptz

resources
  id              uuid PK
  facility_id     uuid FK -> facilities.id
  sport_type      text        -- football | cricket | padel | tennis | badminton ...
  name            text
  attributes_json jsonb       -- size, surface, indoor/outdoor, max players
  slot_duration_minutes int
  deleted_at      timestamptz nullable

operating_hours
  id              uuid PK
  resource_id     uuid FK -> resources.id
  day_of_week     int
  open_time       time
  close_time      time

operating_hour_exceptions
  id              uuid PK
  resource_id     uuid FK -> resources.id
  starts_at       timestamptz
  ends_at         timestamptz
  is_closed       boolean
  note            text nullable
```

## Availability & Booking

```
slots
  id              uuid PK
  resource_id     uuid FK -> resources.id
  start_time      timestamptz
  end_time        timestamptz
  status          text        -- open | held | booked | blocked
  hold_token_hash text nullable
  held_by_user_id uuid FK -> users.id, nullable
  held_until      timestamptz nullable
  hold_payment_id uuid FK -> payments.id, nullable
  blocked_by_user_id uuid FK -> users.id, nullable
  block_reason      text nullable
  version         int         -- every optimistic update must compare and increment it
  UNIQUE (resource_id, start_time, end_time)

bookings
  id              uuid PK
  user_id         uuid FK -> users.id
  slot_id         uuid FK -> slots.id
  status          text        -- pending_payment | confirmed | cancelled | expired | no_show
  price_amount    numeric     -- immutable quoted booking price
  currency        char(3)
  platform_commission_amount numeric
  tax_amount      numeric
  cancellation_policy_json jsonb
  cancelled_at    timestamptz nullable
  cancelled_by_user_id uuid FK -> users.id, nullable
  cancellation_reason text nullable
  recurrence_id   uuid nullable  -- (dormant, for future recurring bookings)
  created_at      timestamptz
  -- partial unique index below, not a table constraint

booking_status_history
  id              uuid PK
  booking_id      uuid FK -> bookings.id
  from_status     text nullable
  to_status       text
  actor_user_id   uuid FK -> users.id, nullable
  reason          text nullable
  created_at      timestamptz

recurring_booking_templates   -- (dormant)
  id              uuid PK
  user_id         uuid FK -> users.id
  resource_id     uuid FK -> resources.id
  pattern_json    jsonb
```

## Pricing

```
pricing_rules
  id              uuid PK
  resource_id     uuid FK -> resources.id
  price           numeric
  valid_from      timestamptz
  valid_to        timestamptz nullable  -- (V1: one open-ended flat row per resource)
```

## Addendum: Cash Payments, Commission & Booking-State Additions

This addendum is additive to the schema above. It captures the cash-heavy Pakistan facility-market flow and the booking lifecycle gaps that appear when the platform never sees the underlying money.

### Facility-level payment configuration

```
facilities
  accepted_payment_methods   text[]   -- 'online', 'cash'
  cash_booking_policy        text     -- 'not_applicable' | 'booking_fee' | 'free_hold'
```

Owner sets this at onboarding/edit time. `cash_booking_policy` only matters when `'cash'` is in `accepted_payment_methods`.

### Booking fee (anti-abuse + upfront commission for cash bookings)

For facilities on `booking_fee` policy: customer pays a small non-refundable fee online at booking time; the remainder is paid in cash at the facility. This fee doubles as commission collection for cash bookings, since the platform can't otherwise touch that money.

```
bookings
  payment_method    text   -- 'online' | 'cash_fee' | 'cash_free'
  booking_fee_amount numeric(12,2), nullable
```

Fee amount is computed from the resolved commission rate at booking time — not a manually chosen flat number.

For facilities on `free_hold` policy: no fee, no online payment step. Anti-abuse relies on `users.no_show_count` and post-facto commission settlement.

```
users
  no_show_count   int, default 0
```

Escalating restriction rules (e.g. limit future bookings after N no-shows) are a policy decision to define before launch, enforced in application logic reading this counter.

### Booking states — grace period / check-in

Current state machine had no defined trigger for no-show detection. Fix:

```
bookings.status: pending_payment | confirmed | in_grace | completed | cancelled | no_show | refunded
bookings.arrived_at   timestamptz, nullable

facilities.grace_period_minutes   int   -- e.g. 15
```

Transition flow:
1. `confirmed` → at slot start time, scheduled job flips to `in_grace`.
2. If `arrived_at` set (staff check-in or customer self-check-in) within grace window → `completed`.
3. If grace window expires with `arrived_at` still null → `no_show`, increment `users.no_show_count`.

Commission ledger entries for cash-free bookings are posted on transition to `completed`, never at booking creation — so a cancelled or no-show booking never generates commission owed on something that didn't happen.

### Commission rate configuration (versioned, resolvable, snapshotted)

Same pattern as `pricing_rules` — a real config table, resolved and snapshotted at transaction time so a later rate change never rewrites history.

```
commission_rates
  id            uuid PK
  scope_type    text        -- 'platform' | 'organization' | 'facility'
  scope_id      uuid, nullable   -- null when scope_type = 'platform'
  rate_type     text        -- 'percentage' | 'flat'
  rate_value    numeric(6,4)
  valid_from    timestamptz
  valid_to      timestamptz, nullable
```

Resolution order at booking time: facility override → organization override → platform default. First match wins.

Snapshotting: the resolved rate's ID is written onto the transaction record at the moment it's applied — never re-resolved later.

```
payments.commission_rate_id        uuid FK -> commission_rates.id
ledger_entries.commission_rate_id  uuid FK -> commission_rates.id
```

`booking_fee_amount` = `resolved_price × resolved_commission_rate` for percentage-based facilities, or the flat value directly if `rate_type = 'flat'` — computed once at booking time.

### Commission ledger — entries in the existing double-entry ledger, not a separate table

Do not build a standalone `commission_ledger` table — it would let the ledger and commission bookkeeping disagree with each other. Commission is just another set of entries in the single `ledger_entries` table already defined for the double-entry model.

```
ledger_entries
  id                    uuid PK
  account               text   -- 'customer_clearing' | 'platform_commission_revenue' |
                                -- 'owner_payable' | 'platform_cash' | 'commission_receivable'
  direction             text   -- 'debit' | 'credit'
  amount                numeric(12,2)
  currency              text
  booking_id            uuid FK, nullable
  payment_id            uuid FK, nullable
  refund_id             uuid FK, nullable
  organization_id       uuid FK, nullable
  commission_rate_id    uuid FK -> commission_rates.id
  reversal_of_entry_id  uuid FK, nullable   -- immutable reversals, never edit a posted entry
  created_at            timestamptz
```

Entry pattern per payment path:

| Path | Entries posted |
|---|---|
| Online payment | Debit `customer_clearing` for full amount; credit split between `platform_commission_revenue` and `owner_payable` |
| Cash + booking fee | Debit `customer_clearing` for fee only; credit `platform_commission_revenue`. No receivable — the fee is the commission. |
| Cash + free hold | No cash-side entry (platform never touched money). Debit `commission_receivable`, credit `platform_commission_revenue`. Stays open until settled. |

### Commission settlement (cash + free-hold facilities)

Since the platform never touches money on `free_hold` bookings, commission relies on periodic settlement rather than automatic split:

```
commission_settlements
  id               uuid PK
  organization_id  uuid FK -> organizations.id
  period_start     date
  period_end       date
  amount_due       numeric(12,2)
  status           text   -- 'pending' | 'paid' | 'overdue'
  settled_at       timestamptz, nullable
  settlement_method text  -- 'bank_transfer' | 'jazzcash' | 'easypaisa' | 'manual'
```

On settlement, post a clearing entry against the open `commission_receivable` balance for that organization.

### Enforcement note (trust, not just schema)

Cash-free bookings rely on the owner accurately marking bookings `completed`. No schema fully solves this — mitigations are policy, not code: tie non-payment of settled commission to listing visibility/suspension, and accept some leakage as a known cost of supporting the cash-heavy segment of the market.

## Payments

```
payments
  id              uuid PK
  booking_id      uuid FK -> bookings.id
  attempt_number  int
  provider        text
  amount          numeric
  currency        char(3)
  status          text        -- pending | succeeded | failed | refunded | partially_refunded
  provider_ref    text        -- provider payment/intent identifier
  provider_idempotency_key text nullable
  successful_at   timestamptz nullable
  refunded_amount numeric default 0
  refund_reserved_amount numeric default 0
  failure_code    text nullable
  failed_at       timestamptz nullable
  created_at      timestamptz
  UNIQUE (booking_id, attempt_number)
  UNIQUE (provider, provider_ref)
  UNIQUE (provider, provider_idempotency_key)

refunds
  id              uuid PK
  payment_id      uuid FK -> payments.id
  provider        text
  amount          numeric
  currency        char(3)
  status          text        -- pending | succeeded | failed
  provider_ref    text nullable
  reason          text
  issued_by       uuid FK -> users.id, nullable  -- null for system exception refund
  created_at      timestamptz
  completed_at    timestamptz nullable
  UNIQUE (provider, provider_ref)

payment_webhook_events
  id              uuid PK
  provider        text
  provider_event_id text
  payload_json    jsonb
  received_at     timestamptz
  processed_at    timestamptz nullable
  processing_attempts int default 0
  last_error      text nullable
  UNIQUE (provider, provider_event_id)

payment_exceptions
  id              uuid PK
  payment_id      uuid FK -> payments.id
  kind            text        -- late_capture | capture_without_hold | reconciliation_mismatch
  status          text        -- open | refund_pending | resolved
  details_json    jsonb
  created_at      timestamptz
  resolved_at     timestamptz nullable

ledger_journals
  id              uuid PK
  booking_id      uuid FK -> bookings.id, nullable
  payment_id      uuid FK -> payments.id, nullable
  refund_id       uuid FK -> refunds.id, nullable
  payout_id       uuid FK -> payouts.id, nullable
  kind            text        -- charge | refund | payout | chargeback
  status          text        -- draft | posted | reversed
  currency        char(3)
  posted_at       timestamptz nullable
  occurred_at     timestamptz

financial_ledger_entries
  id              uuid PK
  journal_id      uuid FK -> ledger_journals.id
  organization_id uuid FK -> organizations.id
  account         text        -- cash_clearing | owner_payable | platform_revenue | refund_liability | payout_clearing
  debit_amount    numeric default 0
  credit_amount   numeric default 0
  currency        char(3)

payouts        -- (manual process in V1, table structure ready for automation)
  id              uuid PK
  organization_id uuid FK -> organizations.id
  amount          numeric
  currency        char(3)
  status          text        -- pending | paid | failed
  provider        text nullable
  provider_ref    text nullable
  paid_at         timestamptz nullable
  failed_at       timestamptz nullable
  failure_reason  text nullable
  period_start    date
  period_end      date
  UNIQUE (provider, provider_ref)

payout_ledger_entries
  payout_id       uuid FK -> payouts.id
  ledger_entry_id uuid FK -> financial_ledger_entries.id
  amount          numeric
  PK (payout_id, ledger_entry_id)
```

## Reviews (dormant)

```
reviews
  id              uuid PK
  booking_id      uuid FK -> bookings.id
  user_id         uuid FK -> users.id
  rating          int
  comment         text
  created_at      timestamptz
```

## Messaging Reliability

```
outbox_events
  id              uuid PK
  event_type      text        -- 'booking.confirmed', 'payment.failed', etc.
  payload_json    jsonb
  created_at      timestamptz
  published_at    timestamptz nullable
  publish_attempts int
  last_error      text nullable

processed_events   -- consumer-side idempotency
  event_id        uuid
  consumer_name   text
  processed_at    timestamptz
  PK (event_id, consumer_name)

api_idempotency_keys
  id              uuid PK
  user_id         uuid FK -> users.id
  endpoint        text
  key             text
  request_hash    text
  response_status int
  response_json   jsonb
  created_at      timestamptz
  expires_at      timestamptz
  UNIQUE (user_id, endpoint, key)
```

## Ops

```
audit_log
  id              uuid PK
  actor_user_id   uuid FK -> users.id, nullable  -- null for system action
  action          text
  entity_type     text
  entity_id       uuid
  metadata_json   jsonb
  request_id      uuid nullable
  source_ip       inet nullable
  created_at      timestamptz

notifications_log
  id              uuid PK
  user_id         uuid FK -> users.id
  event_id        uuid FK -> outbox_events.id
  channel         text        -- email | sms | push (dormant)
  template        text
  status          text        -- sent | failed
  sent_at         timestamptz
  UNIQUE (event_id, user_id, channel, template)
```

## Booking, payment, and retention invariants

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX user_role_assignments_one_active_non_player
ON user_role_assignments (user_id)
WHERE revoked_at IS NULL;

ALTER TABLE slots
ADD CONSTRAINT slots_no_overlapping_ranges
EXCLUDE USING gist (
  resource_id WITH =,
  tstzrange(start_time, end_time, '[)') WITH &&
);

CREATE UNIQUE INDEX bookings_one_active_per_slot
ON bookings (slot_id)
WHERE status IN ('pending_payment', 'confirmed', 'no_show');

CREATE UNIQUE INDEX payments_one_successful_capture_per_booking
ON payments (booking_id)
WHERE successful_at IS NOT NULL;

ALTER TABLE pricing_rules
ADD CONSTRAINT pricing_rules_no_overlapping_ranges
EXCLUDE USING gist (
  resource_id WITH =,
  tstzrange(valid_from, COALESCE(valid_to, timestamptz 'infinity'), '[)') WITH &&
);

ALTER TABLE cancellation_policy_versions
ADD CONSTRAINT cancellation_policy_versions_no_overlap
EXCLUDE USING gist (
  facility_id WITH =,
  tstzrange(valid_from, COALESCE(valid_to, timestamptz 'infinity'), '[)') WITH &&
);
```

- Holding a slot creates its `bookings` row with `pending_payment` status in same transaction. Payment webhook confirms that row; expiry changes it to `expired`. This satisfies `payments.booking_id` before payment creation.
- Holding transaction also creates one pending `payments` attempt and stores its ID in `slots.hold_payment_id`. `payments.provider_ref` is sole provider payment-intent reference; no independent payment-intent text is stored on slot. Payment webhook resolves payment attempt by `(provider, provider_ref)`, then locks linked slot and booking.
- `slots.status = 'held'` requires `hold_token_hash`, `held_by_user_id`, `hold_payment_id`, and future `held_until`; other states require those fields to be null. `blocked` requires blocker and reason. Payment webhook confirms only if linked payment, hold owner, and unexpired hold match.
- A customer cancellation records actor, time, reason, and policy snapshot. If policy allows release, transaction changes booking to `cancelled` and slot to `open`; partial unique index then permits later rebooking. Refund outcome remains payment/refund state, not booking state.
- Booking creation and provider event processing are idempotent. Payment amount, currency, commission, and tax are copied into `bookings` at quote/confirmation time and never recomputed from later pricing rules.
- One booking may have many payment attempts but only one successful capture. Each attempt has a sequence number and provider reference. Refund creation locks successful payment row, verifies `refunded_amount + refund_reserved_amount + refund.amount <= payment.amount`, creates pending refund, and increments reservation before provider call. Provider success moves reserved amount to `refunded_amount`; failure releases reservation.
- On hold expiry, cancel provider payment intent before releasing slot. A later successful capture never confirms booking: create `payment_exceptions` row and issue/refund through exception workflow.
- Verify provider webhook signature against raw request body before accepting it into `payment_webhook_events`; rejected requests go only to security logs. Verified events retain receipt, attempts, errors, and idempotency state.
- `ledger_journals` and immutable `financial_ledger_entries` form double-entry reconciliation source. Deferred database constraint trigger verifies every `posted` journal has balanced debit and credit totals in its currency; corrections use reversal journals, never edits. Payout journals link to payout and may cover many booking entries. Payouts reference settled owner-payable entries, including manual V1 payouts.
- Client idempotency is scoped by authenticated user and endpoint. Reusing key with different request hash returns conflict; same request returns stored response. Provider webhooks dedupe by `(provider, provider_event_id)`.
- Slot, booking, payment, refund, and payout transitions are allow-listed in service code and executed with related rows in one transaction. `booking_status_history` records every booking transition.
- `bookings`, `payments`, `refunds`, `payouts`, and `audit_log` are immutable history. They are not hard-deleted or cascade-deleted. Legal erasure anonymizes eligible user data without altering money or audit facts.
- `users`, `organizations`, `facilities`, `resources`, and custom roles use `deleted_at`/disabled status. Queries, authorization, search, caches, and background jobs must exclude deleted records. Active emails use a partial, case-insensitive unique index: `UNIQUE (lower(email)) WHERE deleted_at IS NULL`.
- Role assignments are revoked with `revoked_at`; operating hours and prices are retired by effective dates. Expired refresh tokens, used/expired invites, processed-event records, and published outbox rows may be hard-deleted only by documented retention jobs.
- `audit_log` is append-only. Application runtime role may insert but lacks `UPDATE`/`DELETE` privilege; automated actions use null actor plus request/job metadata.
- Send SMS only to `phone_e164` values that are verified, consented, and not opted out. Marketplace settlement is allowed only for organizations with verified KYC, eligible payout status, a provider account reference, and settlement currency.
- `cancellation_policy_versions` is the canonical policy source. Booking stores immutable policy snapshot; policy edits never change existing bookings. Only one policy version may apply at a given facility/time.
- Password-reset tokens are single-use and hashed; expired/used reset tokens are retention-job cleanup targets.

Diagram: see [`10-mermaid-diagrams.md`](10-mermaid-diagrams.md).
