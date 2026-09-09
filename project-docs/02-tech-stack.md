# Tech Stack

## Backend
- **NestJS (TypeScript)** — core modular monolith. Modules map directly to domain boundaries in `06-architecture-modules.md`.
- Extraction candidate later: **Go** microservice for the availability engine, only if load testing shows the locking path is the bottleneck. Not built in V1.

## Database
- **PostgreSQL** — ACID transactions for booking conflicts, PostGIS for geo search, JSONB for flexible attributes (amenities, resource-specific fields).
- Self-managed (RDS/Cloud SQL) or Supabase-hosted Postgres for speed — either way, own the RBAC/authorization logic in the NestJS layer, not in database-level row policies.

## Messaging
- **RabbitMQ** — one topic exchange (`domain_events`), routing keys per event name, per-consumer queues with dead-letter queues.
- **Transactional outbox pattern**: `outbox_events` table written in the same DB transaction as the business change; a relay worker publishes to RabbitMQ and marks rows published. Prevents the dual-write problem (DB and queue disagreeing after a crash).

## Caching / Locking
- **Redis** — permission-check cache (`perms:{user_id}`), general query caching. PostgreSQL row locks are source of truth for slot holds; Redis is not used as booking lock.

## Mobile
- **Flutter** — single codebase for iOS + Android.

## Web
- **Next.js (TypeScript)** — consumer-facing app (SSR for SEO on facility discovery pages).
- **React SPA** — internal owner/admin dashboard (no SEO need).

## Payments
- **Stripe Connect** (or local gateway equivalent, e.g. JazzCash/Easypaisa/PayFast if Stripe Connect isn't fully supported in the target market) — marketplace split payments, owner KYC, payout scheduling.

## Infra
- **Docker** everywhere.
- **AWS ECS Fargate / Google Cloud Run** for orchestration — Kubernetes only if/when multiple extracted services justify it.
- **GitHub Actions** for CI/CD.

## Search (future)
- Postgres full-text + PostGIS for V1. Migrate to **Typesense** when search complexity outgrows SQL (thousands of facilities, complex fuzzy filters).
