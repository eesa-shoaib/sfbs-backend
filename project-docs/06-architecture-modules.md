# Architecture: Modular Monolith + Event-Driven Boundaries

## Why modular monolith, not microservices, for V1
Booking correctness needs ACID transactions (row-level locks, no eventual consistency on "did I get the slot"). Microservices trade that away for independent scaling you don't need yet. Split into services later, driven by measured bottlenecks — not speculation. The most likely future extraction is a dedicated Go service for the availability engine, if load testing shows the locking path is the constraint.

## Module boundaries (single deployable)

- **Identity & access** — auth, RBAC, sessions, staff invites
- **Facility & resource** — onboarding, approval, resource/court management
- **Booking (minimal)** — slot locking, booking lifecycle
- **Payments** — charge, refund, payout tracking
- **Search & discovery** — geo search, filters
- **Notifications** — email/SMS via a channel-agnostic interface

## The core rule: modules never reach into each other's tables or internals

A module calls another module only through its exposed service interface, or by emitting a domain event that other modules subscribe to without the emitter knowing who's listening. This is what makes "expand later without a rewrite" actually true rather than aspirational — a new listener is how you add a feature, not a change to the module that already exists.

Example: `BookingModule` doesn't import `PaymentsModule` internals. It calls `PaymentsService.charge(bookingId, amount)` through an interface, and emits `booking.confirmed`. `NotificationsModule` listens for `booking.confirmed` and sends the email. Adding push notifications later means adding a new listener for the same event — zero changes to `BookingModule`. Adding an analytics module later is the same pattern.

## Messaging: RabbitMQ + transactional outbox

**Problem being solved**: writing to Postgres and publishing to RabbitMQ are two separate operations. A crash between them leaves the database and the queue disagreeing (e.g. booking confirmed in the DB, but the "send confirmation" message never published).

**Solution**: the transactional outbox pattern.
1. When a module makes a business-state change, it writes a row to `outbox_events` in the **same database transaction** as that change.
2. A separate relay worker polls `outbox_events` for unpublished rows, publishes them to RabbitMQ, then marks `published_at`.
3. Because event write and business write are one transaction, neither can be committed without other. Relay publication can still duplicate after publish-before-mark crash; consumers must be idempotent.

**Topology**: one topic exchange (`domain_events`), routing keys matching event names (`booking.confirmed`, `payment.failed`, `staff.invited`, etc.). Each consumer module binds its own queue to the routing keys it cares about. Every queue has a matching dead-letter queue (`x-dead-letter-exchange`) so a message that repeatedly fails processing parks for inspection instead of blocking the queue.

**Consumer idempotency**: RabbitMQ delivers "at least once," so every consumer checks `processed_events` (keyed by event ID + consumer name), performs its local effect, and records processed event in same local DB transaction before acknowledgement. This makes duplicate delivery harmless. Relay workers claim rows with `FOR UPDATE SKIP LOCKED`, retry with backoff, and record attempts/errors.

## Audit durability

Audit logging is not only an asynchronous listener. Every security-sensitive or state-changing command writes its required `audit_log` row in same Postgres transaction as business change. Event listeners may enrich or export audit data later, but cannot be sole audit writer.

## What this buys you for future changes

- New feature = new module + new event listeners, not edits scattered through existing modules.
- Extracting a module into its own deployable service later = swap the in-process call/event for the same RabbitMQ event, no change to callers.
- Event stream can enrich/export audit data without changing write modules; transactional audit rows remain source of record.

Diagram: see [`10-mermaid-diagrams.md`](10-mermaid-diagrams.md).
