# Sports Facility Booking System

NestJS API for a sports-facility marketplace. Version 1 covers identity and access, facilities and resources, availability and booking, payments, search/discovery, and notifications.

The product blueprint lives in [`project-docs/`](project-docs/00-README.md). Start with [`01-v1-scope.md`](project-docs/01-v1-scope.md) for the feature boundary, then follow the numbered documents in [`00-README.md`](project-docs/00-README.md).

## Current state

- NestJS modular API scaffold is in place under `src/`.
- Domain boundaries currently include identity/access, facility/resource, booking, payments, search/discovery, and notifications.
- Local infrastructure is defined for PostgreSQL/PostGIS, Redis, and RabbitMQ.
- V1 database design, migration rules, seed rules, auth flow, RBAC, booking rules, and architecture are documented in `project-docs/`.
- Production payment provider, migration runner, and application-level persistence are still pending.

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose

## Quick start

```bash
npm install
docker compose up -d
npm run start:dev
```

API starts on `http://localhost:3000`.

Local service defaults:

| Service | Address | Credentials |
| --- | --- | --- |
| PostgreSQL/PostGIS | `localhost:5432` | `app` / `app`, database `sfbs_dev` |
| Redis | `localhost:6379` | — |
| RabbitMQ | `localhost:5672` | `app` / `app` |
| RabbitMQ management | `http://localhost:15672` | `app` / `app` |

Copy [`project-docs/.env.example`](project-docs/.env.example) to `.env` and adjust local values before connecting application code to infrastructure.

## Commands

```bash
npm run start:dev   # development with watch mode
npm run build       # compile to dist/
npm run start:prod # run compiled application
npm test            # unit tests
npm run test:e2e    # end-to-end tests
npm run test:cov    # coverage report
npm run lint        # lint and autofix
npm run format      # format source and tests
```

## Repository layout

```text
src/
  modules/          # domain modules
  database/         # database wiring
test/               # end-to-end tests
project-docs/       # V1 blueprint and infrastructure notes
docker-compose.yml  # local PostgreSQL, Redis, RabbitMQ
```

## V1 documentation

Read [`project-docs/00-README.md`](project-docs/00-README.md) for the complete reading order. Key references:

- [`01-v1-scope.md`](project-docs/01-v1-scope.md) — included, deferred, and explicitly cut features
- [`03-database-schema.md`](project-docs/03-database-schema.md) — schema and lifecycle rules
- [`04-rbac-permissions.md`](project-docs/04-rbac-permissions.md) — roles and permission scoping
- [`05-auth-token-flow.md`](project-docs/05-auth-token-flow.md) — access and refresh token flow
- [`07-availability-booking-engine.md`](project-docs/07-availability-booking-engine.md) — slot locking and booking correctness
- [`09-database-migrations-seeding.md`](project-docs/09-database-migrations-seeding.md) — migration and seed requirements
- [`11-repo-setup.md`](project-docs/11-repo-setup.md) — repository and local bootstrap guidance

## Development notes

Keep domain boundaries explicit. Booking, payment, and audit history must remain immutable; operational records use soft deletion or disablement. Do not enable ORM schema synchronization in deployed environments. Follow the migration and seed rules before adding persistent entities.

## License

This project is currently private and has no public license.
