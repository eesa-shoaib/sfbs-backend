# Extensibility Roadmap

How each deferred feature slots into V1's architecture without a breaking change.

| Feature | How it plugs in later |
|---|---|
| Recurring bookings | `recurring_booking_templates` table and `bookings.recurrence_id` already exist. Build generation job that creates individual `bookings`/`slots` from template. It must use same hold, payment, timezone, and overlap invariants as single booking. |
| Dynamic/peak pricing | `pricing_rules` already supports multiple rows per resource with `valid_from`/`valid_to`. Add a scheduled job or admin UI that inserts time-bound rows. Booking flow reads current applicable price only when quoting; confirmed bookings retain immutable price snapshots. |
| Reviews & ratings | `reviews` table exists. Add a listener on `booking.confirmed` (or a "booking completed" event) that unlocks the review prompt, plus the UI. No changes to booking/payment modules. |
| Owner analytics dashboard | Data already flows through `bookings`/`payments`/`outbox_events`. Add a new consumer that aggregates into read-optimized tables or a reporting service — doesn't touch the write path. |
| Automated payouts | `payouts` table already tracks status/period. Replace the manual status-update step with a scheduled job calling the payment provider's payout API — same table, same downstream consumers. |
| Push notifications | `NotificationService` is already channel-agnostic. Add a push adapter; existing email/SMS adapters and callers are untouched. |
| Resource-level staff scoping | `user_role_assignments.scope_type` already supports `'resource'`, not just `'facility'`. Turning this on is a UI change (letting an owner pick a specific court when assigning staff), not a schema or backend logic change. |
| Elasticsearch/Typesense search | Search module is already isolated behind its own service interface. Swap the Postgres full-text implementation for a Typesense-backed one behind the same interface. |
| Extracting the availability engine into a Go service | Callers already only use `AvailabilityService.holdSlot/confirmSlot/releaseSlot`. Move the implementation behind those methods to a remote call (gRPC/HTTP) or an event-driven interaction over RabbitMQ — callers don't change. |
| Resource partitioning (splitting one court into sub-units) | Requires a new `sub_resource_id` concept in `slots`/`bookings` — the one deferred item that will need a real migration, flagged here so it's a deliberate future decision, not a surprise. |

## What was deliberately built "wide" now specifically to avoid future migrations
- Polymorphic `scope_type`/`scope_id` in RBAC.
- `pricing_rules` as its own table from day one, even with one flat row per resource.
- `recurrence_id` column present on `bookings` even though unused.
- Event-driven module boundaries (RabbitMQ + outbox) so new consumers never require touching existing publishers.
