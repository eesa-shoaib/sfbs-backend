# Sports Facility Booking Platform — V1 Blueprint

This folder is the working blueprint for Version 1 of the marketplace. Read in this order:

1. `01-v1-scope.md` — what's in V1, what's deferred, what's built now but dormant
2. `02-tech-stack.md` — chosen technologies and why
3. `03-database-schema.md` — full schema, including tables for deferred features
4. `04-rbac-permissions.md` — roles, permission taxonomy, custom roles, staff invite flow
5. `05-auth-token-flow.md` — JWT issuance, refresh rotation, revocation
6. `06-architecture-modules.md` — modular monolith boundaries, RabbitMQ + outbox pattern
7. `07-availability-booking-engine.md` — minimal slot-locking design for V1
8. `08-extensibility-roadmap.md` — how each deferred feature slots in later without a rewrite
9. `09-database-migrations-seeding.md` — migration, bootstrap, and reference-data rules
10. `10-mermaid-diagrams.md` — backend architecture and database diagrams
11. `11-repo-setup.md` — repository bootstrap and local development setup

## Core decisions locked in for V1

- **Marketplace model**: 3rd-party facility owners onboard onto the platform (not owner-operated).
- **Platforms**: mobile (Flutter) + web (Next.js consumer, React SPA for owner/admin dashboard), both from day one.
- **Roles**: one role per user account. Multi-user-per-facility is IN v1 (owner + staff, staff scoped per facility/resource).
- **Booking scope (Option B)**: real in-app booking + payment, but no recurring bookings, no dynamic pricing, no resource partitioning, no buffer-time config in V1.
- **Messaging**: RabbitMQ from day one, with a transactional outbox pattern for reliability.
- **Database**: PostgreSQL, schema and migration process built now — including foundations for deferred features (recurring bookings, dynamic pricing, reviews, payouts) to minimize future breaking migrations.

## Repository status

This repository currently contains the V1 blueprint and local infrastructure foundation. Application services are not scaffolded yet. Start with `11-repo-setup.md` before adding NestJS, web, dashboard, or Flutter application code.
- **Booking and money correctness**: holds are owned and expiring; provider webhooks and client writes are idempotent; confirmed bookings retain immutable price, currency, commission, and tax snapshots.
- **Record lifecycle**: operational entities are soft-deleted or disabled; booking, money, and audit history is immutable. No cascade deletion of historical records.
