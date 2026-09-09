# V1 Scope

## In V1 (built and active)

| Module | Notes |
|---|---|
| Auth (JWT access + refresh, rotation, revocation) | See `05-auth-token-flow.md` |
| RBAC — fixed + custom roles, resource/facility scoping | See `04-rbac-permissions.md` |
| Multi-user per facility (owner + staff) | Staff invite is token-gated self-registration, not open signup |
| Facility & resource onboarding + admin approval | Basic internal approval tool, not a full console |
| Search & discovery (geo, sport, price filters) | Postgres + PostGIS; no Elasticsearch/Typesense yet |
| Booking with minimal availability engine | Slot table + row-level lock; see `07-availability-booking-engine.md` |
| Payments (customer charge via Stripe Connect or local gateway) | Split payment: platform commission + owner payout |
| Refunds (manual, support-issued) | No automated dispute workflow yet |
| Notifications — booking confirmation/cancellation | Email + SMS only; interface allows push later |
| Audit logging | All state-changing actions logged from day one |
| Rate limiting on public/auth/booking endpoints | Basic protection against bot abuse |
| RabbitMQ + transactional outbox | Event-driven decoupling between modules from day one |

## Deferred (table exists, feature/UI does not)

| Feature | Why deferred | What's already in place for it |
|---|---|---|
| Recurring bookings | Adds template + generation-job complexity | `recurring_booking_templates` table, `bookings.recurrence_id` column |
| Dynamic/peak pricing | Needs demand rules, not core to launch | `pricing_rules` table (V1 inserts one flat row per resource) |
| Reviews & ratings | Nice-to-have, not launch-blocking | `reviews` table |
| Owner analytics dashboard | Owners can operate without it initially | Data already captured in `bookings`/`payments`; just no UI |
| Automated payouts | Manual payout acceptable for first weeks | `payouts` table, manual status updates |
| Push notifications | Email/SMS covers launch needs | `NotificationService` interface supports new channel adapters |
| Elasticsearch/Typesense search | Postgres full-text + PostGIS sufficient at V1 scale | Search module already isolated behind its own service |

## Explicitly cut from V1 (Option B)

- No resource partitioning (splitting one court into sub-bookable units)
- No configurable buffer/turnover time between bookings
- No dispute automation — refunds are manual, support-initiated

## Non-functional baseline (non-negotiable even at V1)

- Idempotency keys on booking/payment write endpoints
- Consumer idempotency on all RabbitMQ listeners (dedupe via `processed_events`)
- Dead-letter queues on every consumer queue
- Structured logging + basic alerting on payment failure rate and booking-conflict rate
- PCI-safe payment handling (no raw card storage, tokenized gateway only)
- Persisted idempotency keys for booking/payment writes and provider webhook event IDs
- Facility timezone, exceptional hours, and slot-overlap constraints before generating slots
- Soft-delete, retention, and personal-data anonymization policy; no cascade deletion of historical records
- Explicit booking lifecycle, cancellation/rebooking rule, and financial reconciliation ledger
- Versioned migrations, idempotent reference-data seeds, and tested backup/restore before production
- Verified SMS consent/opt-out and owner provider-account/KYC/payout-eligibility checks before notifications or settlement
- Canonical versioned cancellation policy with immutable booking snapshot
- Secure web/mobile refresh-token storage, password reset, email verification, and payment-intent reconciliation worker
