# Database migrations

Store ordered SQL migrations here, for example:

```text
0001_enable_extensions.sql
0002_identity_access.sql
0003_facilities_resources.sql
0004_slots_bookings.sql
0005_payments_ledger.sql
0006_messaging_ops.sql
```

Migration rules live in [`09-database-migrations-seeding.md`](../09-database-migrations-seeding.md). Do not use ORM schema synchronization in deployed environments. Add migration tests before changing application code that depends on new columns or constraints.
