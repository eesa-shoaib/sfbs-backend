# Mermaid Diagrams

Diagrams reflect V1 module boundaries and schema decisions. They are documentation views, not migration definitions. Keep them aligned with `03-database-schema.md` and `06-architecture-modules.md`.

## Backend architecture

```mermaid
flowchart LR
    Mobile[Flutter mobile]
    Consumer[Next.js consumer web]
    Dashboard[React owner/admin dashboard]

    Edge[CDN / WAF / API edge]
    API[NestJS modular monolith]

    Identity[Identity & Access\nAuth / RBAC / sessions]
    Facility[Facility & Resource\nOnboarding / approval]
    Search[Search & Discovery\nPostgres + PostGIS]
    Booking[Booking\nHold / lifecycle]
    Payment[Payments\nAttempts / refunds / payouts]
    Notify[Notifications\nEmail / SMS adapters]
    Audit[Audit writer\nTransactional audit rows]

    PG[(PostgreSQL\nACID + PostGIS)]
    Redis[(Redis\nPermission/query cache)]
    Outbox[(outbox_events)]
    Relay[Outbox relay worker]
    RMQ{{RabbitMQ\ndomain_events exchange}}
    DLQ[(Dead-letter queues)]
    Scheduler[Scheduler / reconciliation workers]
    Provider[Chosen payment provider\nadapter boundary]
    Email[Email provider]
    SMS[SMS provider]

    Mobile --> Edge
    Consumer --> Edge
    Dashboard --> Edge
    Edge --> API

    API --> Identity
    API --> Facility
    API --> Search
    API --> Booking
    API --> Payment
    API --> Notify

    Identity --> PG
    Identity --> Redis
    Facility --> PG
    Search --> PG
    Booking --> PG
    Payment --> PG
    Audit --> PG
    API --> Outbox
    Outbox --> Relay --> RMQ
    RMQ --> Notify
    RMQ --> Audit
    RMQ --> Scheduler
    RMQ --> DLQ

    Booking -. service interface .-> Payment
    Payment --> Provider
    Scheduler --> PG
    Scheduler --> Provider
    Notify --> Email
    Notify --> SMS
```

Rules:

- Booking correctness stays inside PostgreSQL transactions; RabbitMQ handles durable downstream events, not slot locking.
- Modules call exposed service interfaces or consume events. They do not access another module's tables directly.
- Payment provider choice remains an adapter decision outside the core booking model.
- Every RabbitMQ consumer is idempotent and has a dead-letter queue. Payment, slot-expiry, and outbox workers are retryable.

## Database relationships

```mermaid
erDiagram
    USERS ||--o{ USER_ROLE_ASSIGNMENTS : receives
    USERS ||--o{ STAFF_INVITES : creates
    USERS ||--o{ REFRESH_TOKENS : owns
    USERS ||--o{ BOOKINGS : makes
    USERS ||--o{ AUDIT_LOG : acts
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ REFUNDS : issues
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests

    ORGANIZATIONS ||--o{ FACILITIES : owns
    ORGANIZATIONS ||--o{ ROLES : defines
    ORGANIZATIONS ||--o{ STAFF_INVITES : issues
    ORGANIZATIONS ||--o{ PAYOUTS : receives
    ORGANIZATIONS ||--o{ FINANCIAL_LEDGER_ENTRIES : records
    USERS ||--o{ ORGANIZATIONS : owns

    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : contains
    ROLES ||--o{ USER_ROLE_ASSIGNMENTS : assigned
    ROLES ||--o{ STAFF_INVITES : suggests

    FACILITIES ||--o{ RESOURCES : contains
    FACILITIES ||--o{ CANCELLATION_POLICY_VERSIONS : versions
    RESOURCES ||--o{ OPERATING_HOURS : defines
    RESOURCES ||--o{ OPERATING_HOUR_EXCEPTIONS : overrides
    RESOURCES ||--o{ SLOTS : generates
    RESOURCES ||--o{ PRICING_RULES : prices
    RESOURCES ||--o{ RECURRING_BOOKING_TEMPLATES : schedules

    SLOTS ||--o| BOOKINGS : reserves
    BOOKINGS ||--o{ BOOKING_STATUS_HISTORY : transitions
    BOOKINGS ||--o{ PAYMENTS : attempts
    BOOKINGS ||--o{ REVIEWS : receives
    BOOKINGS ||--o{ FINANCIAL_LEDGER_ENTRIES : posts
    RECURRING_BOOKING_TEMPLATES ||--o{ BOOKINGS : generates

    PAYMENTS ||--o{ REFUNDS : has
    PAYMENTS ||--o{ PAYMENT_WEBHOOK_EVENTS : updates
    PAYMENTS ||--o{ PAYMENT_EXCEPTIONS : raises
    PAYMENTS ||--o{ FINANCIAL_LEDGER_ENTRIES : posts

    REFUNDS ||--o{ FINANCIAL_LEDGER_ENTRIES : posts
    SLOTS ||--o| PAYMENTS : holds
    LEDGER_JOURNALS ||--o{ FINANCIAL_LEDGER_ENTRIES : balances
    PAYOUTS ||--o{ PAYOUT_LEDGER_ENTRIES : settles
    FINANCIAL_LEDGER_ENTRIES ||--o{ PAYOUT_LEDGER_ENTRIES : allocated
    PAYOUTS ||--o{ LEDGER_JOURNALS : posts

    OUTBOX_EVENTS ||--o{ PROCESSED_EVENTS : consumed
    OUTBOX_EVENTS ||--o{ NOTIFICATIONS_LOG : delivers

    USERS {
      uuid id PK
      text email UK
      text account_type
      text status
      timestamptz deleted_at
    }
    ORGANIZATIONS {
      uuid id PK
      uuid owner_user_id FK
      text payment_provider
      text provider_account_ref
      text kyc_status
    }
    FACILITIES {
      uuid id PK
      uuid organization_id FK
      text timezone
      geography location
      text status
    }
    RESOURCES {
      uuid id PK
      uuid facility_id FK
      int slot_duration_minutes
      text sport_type
    }
    SLOTS {
      uuid id PK
      uuid resource_id FK
      timestamptz start_time
      timestamptz end_time
      text status
      timestamptz held_until
      uuid hold_payment_id FK
    }
    BOOKINGS {
      uuid id PK
      uuid user_id FK
      uuid slot_id FK
      text status
      numeric price_amount
      char currency
    }
    PAYMENTS {
      uuid id PK
      uuid booking_id FK
      int attempt_number
      text provider_ref
      text status
      numeric amount
      numeric refunded_amount
    }
    REFUNDS {
      uuid id PK
      uuid payment_id FK
      text status
      numeric amount
    }
    LEDGER_JOURNALS {
      uuid id PK
      uuid booking_id FK
      uuid payout_id FK
      text kind
      text status
      char currency
    }
    FINANCIAL_LEDGER_ENTRIES {
      uuid id PK
      uuid journal_id FK
      text account
      numeric debit_amount
      numeric credit_amount
      char currency
    }
    PAYOUTS {
      uuid id PK
      uuid organization_id FK
      numeric amount
      char currency
      text status
    }
    OUTBOX_EVENTS {
      uuid id PK
      text event_type
      timestamptz published_at
    }
```

`SLOTS ||--o| BOOKINGS` describes the active-booking partial unique index. Cancelled and expired booking history may contain multiple rows for one slot over time.
