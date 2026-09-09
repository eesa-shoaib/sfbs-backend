# Initial Repository Setup

## Current structure

```text
.
├── 00-README.md … 10-mermaid-diagrams.md   # V1 blueprint
├── .env.example                            # local configuration template
├── docker-compose.yml                      # PostgreSQL/PostGIS, Redis, RabbitMQ
├── migrations/                             # ordered SQL migrations
└── seeds/                                  # idempotent reference seeds
```

Application work should be added as separate deployable boundaries:

```text
apps/
├── api/                                    # NestJS modular monolith
├── consumer-web/                            # Next.js
├── owner-dashboard/                         # React SPA
└── mobile/                                  # Flutter
```

Keep shared contracts, generated clients, and infrastructure tooling outside domain modules. Do not create application directories until their build toolchain and CI checks are ready; empty placeholders hide missing setup.

## Local bootstrap

1. Copy `.env.example` to `.env` and replace local-only secrets.
2. Run `docker compose up -d`.
3. Enable `postgis` and `btree_gist` through the first migration.
4. Apply migrations, then run idempotent reference seeds.
5. Start API and workers only after PostgreSQL, Redis, and RabbitMQ health checks pass.

RabbitMQ management UI is available at `http://localhost:15672` in local development. Do not expose it publicly.

## Required before application implementation

- Choose and configure a migration runner with advisory locking and migration-history checksums.
- Add CI for fresh-database migrations, upgrades from prior schema, seed idempotency, and integration tests listed in `09-database-migrations-seeding.md`.
- Add service-specific Dockerfiles and deployment manifests only when each application exists.
- Keep payment provider adapter configuration abstract; this setup does not select a production payment provider.
