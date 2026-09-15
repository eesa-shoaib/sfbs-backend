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
    Booking[Booking\nHold / lifecycle / no-show]
    Payment[Payments\nAttempts / refunds / ledgers]
    Commission[Commission\nRate resolution / settlement]
    Notify[Notifications\nEmail / SMS adapters]
    Audit[Audit writer\nTransactional audit rows]

    PG[(PostgreSQL\nACID + PostGIS)]
    Redis[(Redis\nPermission/query cache)]
    Outbox[(outbox_events)]
    Relay[Outbox relay worker]
    RMQ{{RabbitMQ\ndomain_events exchange}}
    DLQ[(Dead-letter queues)]
    Scheduler[Scheduler / grace + settlement workers]
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
    API --> Commission
    API --> Notify

    Identity --> PG
    Identity --> Redis
    Facility --> PG
    Search --> PG
    Booking --> PG
    Payment --> PG
    Commission --> PG
    Audit --> PG
    API --> Outbox
    Outbox --> Relay --> RMQ
    RMQ --> Notify
    RMQ --> Audit
    RMQ --> Scheduler
    RMQ --> DLQ

    Booking -. service interface .-> Payment
    Booking -. grace-check .-> Scheduler
    Payment -. settlement .-> Commission
    Payment --> Provider
    Scheduler --> PG
    Scheduler --> Provider
    Notify --> Email
    Notify --> SMS
```

Rules:

- Booking correctness stays inside PostgreSQL transactions; RabbitMQ handles durable downstream events, not slot locking.
- The scheduler owns `confirmed -> in_grace -> completed/no_show` transitions and commission settlement jobs for cash-heavy facilities.
- Modules call exposed service interfaces or consume events. They do not access another module's tables directly.
- Payment provider choice remains an adapter decision outside the core booking model.
- Every RabbitMQ consumer is idempotent and has a dead-letter queue. Payment, slot-expiry, no-show, and outbox workers are retryable.

## Cash booking lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant API as API / Booking Service
    participant Slot as Slot + Booking Store
    participant Pay as Payment + Commission Service
    participant Scheduler as Grace / No-show Worker
    participant Owner as Facility Owner
    participant Ledger as Ledger / Settlement

    User->>API: POST /v1/bookings with payment policy
    API->>Slot: validate facility policy + slot availability
    alt online or cash_fee
        API->>Pay: create payment intent / fee capture
        Pay-->>API: payment intent or booking fee result
    else cash_free
        API-->>Slot: create booking status='confirmed'
    end
    Slot-->>User: booking created

    Scheduler->>Slot: transition status='confirmed' -> 'in_grace' at slot start
    alt staff or customer check-in within grace window
        User->>API: POST /v1/bookings/:id/check-in
        API->>Slot: set arrived_at, status='completed'
        API->>Ledger: post commission entries if cash-free, or settle fee online
    else grace window expires without arrived_at
        Scheduler->>Slot: status='no_show'
        Scheduler->>Slot: increment users.no_show_count
        Scheduler-->>Ledger: no commission posting for no-show booking
    end

    Owner->>Ledger: periodic settlement for cash-free commission_receivable
```

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
    USERS ||--o{ COMMISSION_SETTLEMENTS : settles

    ORGANIZATIONS ||--o{ FACILITIES : owns
    ORGANIZATIONS ||--o{ ROLES : defines
    ORGANIZATIONS ||--o{ STAFF_INVITES : issues
    ORGANIZATIONS ||--o{ PAYOUTS : receives
    ORGANIZATIONS ||--o{ COMMISSION_SETTLEMENTS : has
    USERS ||--o{ ORGANIZATIONS : owns

    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : contains
    ROLES ||--o{ USER_ROLE_ASSIGNMENTS : assigned
    ROLES ||--o{ STAFF_INVITES : suggests

    FACILITIES ||--o{ RESOURCES : contains
    FACILITIES ||--o{ CANCELLATION_POLICY_VERSIONS : versions
    FACILITIES ||--o{ COMMISSION_RATES : scopes
    FACILITIES ||--o{ COMMISSION_SETTLEMENTS : aggregates
    RESOURCES ||--o{ OPERATING_HOURS : defines
    RESOURCES ||--o{ OPERATING_HOUR_EXCEPTIONS : overrides
    RESOURCES ||--o{ SLOTS : generates
    RESOURCES ||--o{ PRICING_RULES : prices
    RESOURCES ||--o{ RECURRING_BOOKING_TEMPLATES : schedules

    SLOTS ||--o| BOOKINGS : reserves
    BOOKINGS ||--o{ BOOKING_STATUS_HISTORY : transitions
    BOOKINGS ||--o{ PAYMENTS : attempts
    BOOKINGS ||--o{ REVIEWS : receives
    BOOKINGS ||--o{ LEDGER_ENTRIES : posts
    RECURRING_BOOKING_TEMPLATES ||--o{ BOOKINGS : generates

    PAYMENTS ||--o{ REFUNDS : has
    PAYMENTS ||--o{ PAYMENT_WEBHOOK_EVENTS : updates
    PAYMENTS ||--o{ PAYMENT_EXCEPTIONS : raises
    PAYMENTS ||--o{ LEDGER_ENTRIES : posts
    PAYMENTS }o--|| COMMISSION_RATES : snapshots

    REFUNDS ||--o{ LEDGER_ENTRIES : posts
    SLOTS ||--o| PAYMENTS : holds
    COMMISSION_RATES ||--o{ LEDGER_ENTRIES : resolves
    COMMISSION_SETTLEMENTS ||--o{ LEDGER_ENTRIES : clears
    PAYOUTS ||--o{ PAYOUT_LEDGER_ENTRIES : settles
    LEDGER_ENTRIES ||--o{ PAYOUT_LEDGER_ENTRIES : allocated
    PAYOUTS ||--o{ LEDGER_JOURNALS : posts

    OUTBOX_EVENTS ||--o{ PROCESSED_EVENTS : consumed
    OUTBOX_EVENTS ||--o{ NOTIFICATIONS_LOG : delivers

    USERS {
      uuid id PK
      text email UK
      text account_type
      text status
      int no_show_count
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
      text[] accepted_payment_methods
      text cash_booking_policy
      int grace_period_minutes
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
      text payment_method
      numeric price_amount
      numeric booking_fee_amount
      timestamptz arrived_at
      char currency
    }
    COMMISSION_RATES {
      uuid id PK
      text scope_type
      uuid scope_id
      text rate_type
      numeric rate_value
      timestamptz valid_from
      timestamptz valid_to
    }
    PAYMENTS {
      uuid id PK
      uuid booking_id FK
      uuid commission_rate_id FK
      int attempt_number
      text provider_ref
      text status
      numeric amount
      numeric refunded_amount
    }
    COMMISSION_SETTLEMENTS {
      uuid id PK
      uuid organization_id FK
      date period_start
      date period_end
      numeric amount_due
      text status
      text settlement_method
    }
    LEDGER_ENTRIES {
      uuid id PK
      text account
      text direction
      numeric amount
      char currency
      uuid booking_id FK
      uuid payment_id FK
      uuid organization_id FK
      uuid commission_rate_id FK
      uuid reversal_of_entry_id FK
      timestamptz created_at
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
