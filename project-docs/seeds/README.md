# Reference seeds

Seeds contain only global reference data:

- permission keys;
- system roles;
- system role-permission mappings.

Seeds must be idempotent and use stable natural keys. Never put credentials, organizations, facilities, bookings, payments, or production users here. Full rules: [`09-database-migrations-seeding.md`](../09-database-migrations-seeding.md).
