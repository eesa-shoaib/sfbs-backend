# Database Migrations & Seeding

## Migrations

- Store ordered, versioned SQL migrations in repository. Migration runner owns one advisory lock and records applied versions/checksums in migration-history table.
- Enable database extensions such as PostGIS and `btree_gist` in migrations before tables/indexes depend on them.
- Never use ORM schema synchronization or ad-hoc production SQL for schema changes.
- Migrations are forward-only. Every migration has rollout, rollback/mitigation, lock-time, and data-backfill notes.
- Use expand/deploy/backfill/switch/contract sequence for incompatible changes. Do not remove/rename a column in same release that stops writing it.
- Use transaction for migrations where PostgreSQL supports it. Use documented maintenance procedure for non-transactional operations such as concurrent indexes.
- Before production: test fresh install, upgrade from previous production schema, and restore backup into staging. Monitor migration duration, errors, and replication lag.
- Destructive migrations require tested restore, explicit retention approval, and separate release after application no longer reads old data.

## Seeds and bootstrap

- Seed only global reference data: permission keys, system roles, and system role-permission mappings.
- Seeds are versioned, idempotent, and use stable natural keys such as permission key. Do not depend on generated UUIDs or insertion order.
- Never seed organizations, facilities, bookings, payments, or ordinary users in production.
- Bootstrap first platform administrator through audited deployment command using secret-managed identity/credential; never commit an administrator password.
- Create organization-specific roles, pricing, and owner records in onboarding transaction, not in global seed.
- Seed/test fixtures live separately from production reference seeds and cannot run against production environment.

## Required CI checks

1. Apply every migration to empty PostgreSQL database and run schema checks.
2. Upgrade database from last released schema and run application smoke tests.
3. Run reference seed twice; second run must make no changes.
4. Verify permission/system-role seed values and migration checksums.
5. Run booking, payment-webhook, refund, role-revocation, and soft-delete integration tests against migrated schema.
6. Run concurrent-slot, late-payment-capture, duplicate-webhook, refund-ceiling, ledger-balance, and facility-closure tests against migrated schema.
7. Verify application runtime DB role cannot update/delete `audit_log`, and cross-organization access tests reject every scoped read/write.

## Production resilience baseline

- PostgreSQL encrypted at rest, private network access, managed credentials, and secret rotation. Runtime services receive secrets through secret manager, never repository or seed files.
- Point-in-time recovery plus daily encrypted backups. Target V1 RPO <= 15 minutes and RTO <= 1 hour; perform restore drill at least quarterly.
- RabbitMQ queues durable, messages persistent, dead-letter queues monitored. Alert on outbox age, webhook lag, dead-letter depth, slot-expiry failures, booking conflicts, and payment exception count.
- Record runbooks for database restore, queue replay, provider outage, late capture, refund exception, and facility-wide cancellation.
