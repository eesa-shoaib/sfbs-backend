# API Design

This document is the canonical API contract reference for the SFBS V1 backend. All NestJS controllers, DTOs, guards, and OpenAPI annotations must conform to the rules here. Read alongside `04-rbac-permissions.md`, `05-auth-token-flow.md`, and `07-availability-booking-engine.md`.

## 1. Guiding Principles

Non-negotiable rules that every endpoint must satisfy:

- **REST resource naming**: plural nouns, no verbs in paths. `/v1/bookings`, not `/v1/createBooking`.
- **URL versioning**: all routes prefixed `/v1/`. Bump to `/v2/` only on breaking changes.
- **Stateless**: no server-side session. Auth via `Authorization: Bearer <access_token>` only.
- **Idempotency keys**: required on all non-idempotent write endpoints (booking creation, payment intent, refund). Enforced by guard, not optional.
- **Consistent envelope**: every response — success or error — follows the same top-level shape. No bare arrays, no bare primitives.
- **Explicit machine-readable error codes**: HTTP status alone is never enough. Every error includes an `error.code` string.
- **Timestamps**: always UTC ISO 8601 (`2026-09-15T16:45:00.000Z`). Clients convert to local timezone.
- **Currency**: integer minor units only (`150000` for 1,500.00 PKR). Never floats. Prevents rounding bugs throughout the stack.
- **Immutable history**: no `DELETE` on bookings, payments, audit records, or ledger entries. Soft-delete or cancellation records only.
- **Tenant isolation**: every scoped query verifies ownership through joins. Never trust `organizationId` or `facilityId` supplied in the request body without re-verifying the chain.
- **Ignore unknown fields**: clients must silently ignore JSON fields they don't recognize. Required for backward-compatible response extensions.

---

## 2. Base URL & Versioning

```
Production:  https://api.sfbs.io/v1
Staging:     https://api-staging.sfbs.io/v1
Local:       http://localhost:3000/v1
```

### Version lifecycle

| Event | Action |
|---|---|
| New optional field added to response | No version bump — backward compatible |
| New optional request field added | No version bump — backward compatible |
| New endpoint added | No version bump — backward compatible |
| Response field removed or renamed | New `/v2/` route required |
| Response field type changed | New `/v2/` route required |
| Endpoint removed | Deprecation + Sunset headers, then removal after 90 days minimum |

### Deprecation headers (set on deprecated routes)

```
Deprecation: Sat, 01 Jan 2027 00:00:00 GMT
Sunset: Sat, 01 Apr 2027 00:00:00 GMT
Link: <https://docs.sfbs.io/api/migration-v2>; rel="successor-version"
```

Flutter clients must inspect the `Sunset` header and surface an in-app upgrade prompt before the sunset date. The `Sunset` date is always at least 90 days after the `Deprecation` date.

---

## 3. Authentication & Authorization Headers

### Request headers

```
Authorization: Bearer <access_token>     # Required on all authenticated endpoints
X-Request-ID: <uuid-v4>                  # Client-generated; echoed back in response
Idempotency-Key: <uuid-v4>               # Required on write endpoints (see §6)
Content-Type: application/json           # Required on POST / PATCH with a body
```

### Response headers

```
X-Request-ID: <uuid-v4>                  # Echoes the client value, or server-generated if absent
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 247
X-RateLimit-Reset: 1726431600            # Unix epoch of current window reset
```

### Token refresh — web (HttpOnly cookie)

```
POST /v1/auth/refresh
Cookie: refresh_token=<opaque>

→ 200 { "data": { "accessToken": "...", "expiresIn": 900 } }
→ 401 REFRESH_TOKEN_REUSE_DETECTED   (entire family revoked; client must re-login)
→ 401 REFRESH_TOKEN_EXPIRED
```

### Token refresh — mobile (body)

```
POST /v1/auth/refresh
{ "refreshToken": "<opaque>" }

→ 200 { "data": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }
```

Why two shapes: web stores the refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie inaccessible to JavaScript, eliminating XSS theft. Mobile has no secure cookie storage concept, so OS secure storage + body transport is the correct equivalent. The server differentiates by the presence of the cookie header vs the JSON body field.

---

## 4. Standard Response Envelope

Every response uses the same top-level structure. No exceptions.

### Single resource

```jsonc
{
  "data": {
    "id": "uuid",
    "status": "confirmed"
    // ... resource fields
  },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-09-15T16:45:00.000Z"
  }
}
```

### Paginated list

```jsonc
{
  "data": [
    { "id": "uuid", ... },
    { "id": "uuid", ... }
  ],
  "pagination": {
    "nextCursor": "eyJpZCI6InV1aWQiLCJjcmVhdGVkQXQiOiIyMDI2LTA5LTE1VDE2OjQ1OjAwWiJ9",
    "hasMore": true
  },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-09-15T16:45:00.000Z"
  }
}
```

### Error

```jsonc
{
  "error": {
    "code": "SLOT_ALREADY_HELD",
    "message": "This slot is no longer available.",
    "details": [                              // Optional. Only for validation errors.
      { "field": "slotId", "issue": "Slot is in status 'held'" }
    ],
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

`error.message` is safe to display to end users. `error.code` is for client-side branching logic. `error.details` is for field-level validation failures only — do not leak internal stack traces or DB errors here.

---

## 5. HTTP Status Code Taxonomy

| Status | When to use |
|---|---|
| `200 OK` | Successful GET, PATCH, PUT |
| `201 Created` | Successful POST that creates a new resource |
| `204 No Content` | Successful action with no response body (e.g. logout, invite revocation) |
| `400 Bad Request` | Malformed JSON, missing required fields, type mismatch — `VALIDATION_FAILED` |
| `401 Unauthorized` | Missing or invalid Bearer token, expired or revoked refresh token |
| `403 Forbidden` | Valid token but RBAC check failed — `PERMISSION_DENIED` |
| `404 Not Found` | Resource doesn't exist **or belongs to another tenant** (never leak existence) |
| `409 Conflict` | Idempotency key reused with a different payload — `IDEMPOTENCY_CONFLICT` |
| `410 Gone` | Resource existed but is permanently unavailable (expired hold, deleted facility) |
| `422 Unprocessable Entity` | Business rule violation (e.g. cancelling an already-cancelled booking) |
| `429 Too Many Requests` | Rate limit exceeded — always include `Retry-After` header |
| `500 Internal Server Error` | Unexpected error — log full details server-side, return generic message to client |
| `503 Service Unavailable` | Dependency unreachable (DB, payment provider) — include `Retry-After` |

### Error code registry

All `error.code` values are SCREAMING_SNAKE_CASE. This list is exhaustive — adding a new code requires updating this document.

```
# Auth
INVALID_CREDENTIALS
EMAIL_NOT_VERIFIED
ACCOUNT_SUSPENDED
TOKEN_EXPIRED
TOKEN_REVOKED
REFRESH_TOKEN_REUSE_DETECTED
REFRESH_TOKEN_EXPIRED
PASSWORD_RESET_TOKEN_INVALID
PASSWORD_RESET_TOKEN_EXPIRED

# RBAC
PERMISSION_DENIED
SCOPE_MISMATCH
ROLE_NOT_FOUND
INVITE_TOKEN_INVALID
INVITE_TOKEN_EXPIRED
INVITE_TOKEN_USED
INVITE_ORG_MISMATCH

# Booking
SLOT_NOT_FOUND
SLOT_ALREADY_HELD
SLOT_ALREADY_BOOKED
SLOT_BLOCKED
SLOT_OUTSIDE_OPERATING_HOURS
HOLD_EXPIRED
BOOKING_NOT_FOUND
BOOKING_NOT_CANCELLABLE
BOOKING_ALREADY_CANCELLED
NO_SHOW_THRESHOLD_EXCEEDED

# Payments
PAYMENT_FAILED
PAYMENT_INTENT_EXPIRED
PAYMENT_INTENT_CREATION_FAILED
REFUND_EXCEEDS_PAYMENT_AMOUNT
PROVIDER_UNAVAILABLE
KYC_NOT_VERIFIED
PAYOUT_INELIGIBLE
PAYMENT_NOT_FOUND
CASH_BOOKING_NO_PAYMENT_REQUIRED

# Facility / Resource
FACILITY_NOT_FOUND
FACILITY_PENDING_APPROVAL
FACILITY_SUSPENDED
RESOURCE_NOT_FOUND
ORGANIZATION_NOT_FOUND

# Validation & Infrastructure
VALIDATION_FAILED
IDEMPOTENCY_CONFLICT
RATE_LIMIT_EXCEEDED
UNSUPPORTED_CURRENCY
```

---

## 6. Idempotency

### Header

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Required on:

| Endpoint | Reason |
|---|---|
| `POST /v1/bookings` | Prevents double-booking on network retry |
| `POST /v1/payments/intent` | Prevents double payment intent creation |
| `POST /v1/refunds` | Prevents double refund |

### Behavior

| Scenario | Response |
|---|---|
| First request | Process normally, store `(user_id, endpoint, key, request_hash, response)` |
| Retry — same key, same body | Return stored response immediately (no re-processing) |
| Retry — same key, different body | `409 IDEMPOTENCY_CONFLICT` |
| After key expiry (24 h) | Treat as new request |

Keys are scoped to `(user_id, endpoint, key)`. The same UUID sent by two different authenticated users is independent. See `api_idempotency_keys` in `03-database-schema.md`.

### Provider webhook idempotency

Inbound payment webhooks deduplicate via `(provider, provider_event_id) UNIQUE` on `payment_webhook_events`. The webhook endpoint always returns `200` immediately; actual processing is async. A duplicate delivery is detected and skipped by the consumer, not at the HTTP layer.

---

## 7. Pagination

All list endpoints use **cursor-based pagination**. Offset pagination is not used — it produces skipped or duplicated results when new records are inserted during pagination.

### Request

```
GET /v1/bookings?cursor=<base64>&limit=20
GET /v1/resources/:id/slots?cursor=<base64>&limit=50&from=2026-09-15&to=2026-09-30
```

### Response

```jsonc
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6InV1aWQiLCJzdGFydFRpbWUiOiIyMDI2LTA5LTE1VDE2OjAwOjAwWiJ9",
    "hasMore": true    // false when nextCursor is null
  }
}
```

`nextCursor` is an opaque base64-encoded string. Clients must not parse or construct cursor values. Pass it back verbatim as the `cursor` query parameter on the next page.

The cursor encodes `{ id, sort_key }` where `sort_key` is the field the list is sorted by (e.g. `created_at` for bookings, `start_time` for slots). The sort field plus `id` tiebreaker guarantees stable, unique ordering.

### Default and maximum limits

| Endpoint | Default | Max |
|---|---|---|
| `GET /v1/search/facilities` | 20 | 50 |
| `GET /v1/bookings` | 20 | 100 |
| `GET /v1/resources/:id/slots` | 50 | 200 |
| `GET /v1/organizations/:id/members` | 50 | 200 |
| `GET /v1/organizations/:id/payouts` | 20 | 100 |
| `GET /v1/admin/bookings` | 50 | 200 |

Requests exceeding the max limit receive a `400 VALIDATION_FAILED` response.

---

## 8. Rate Limiting

**Implementation**: `@nestjs/throttler` with Redis storage (same Redis instance as permission cache). Rate limit state is shared across all API instances — limits are per-user or per-IP across the cluster, not per-pod.

### Tiers

| Tier | Endpoints | Limit | Window |
|---|---|---|---|
| Public unauthenticated | `GET /v1/search/*`, `GET /v1/facilities/:id` | 60 req | 1 min per IP |
| Auth endpoints | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/forgot-password` | 10 req | 1 min per IP |
| Authenticated — general | All other authenticated endpoints | 300 req | 1 min per user |
| Write endpoints | `POST /v1/bookings`, `POST /v1/payments/*`, `POST /v1/refunds` | 30 req | 1 min per user |
| Webhook ingestion | `POST /v1/webhooks/payment-provider` | 200 req | 1 min per provider IP (allowlist) |

### Rate limit exceeded response

```
HTTP/1.1 429 Too Many Requests
Retry-After: 47
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1726431600

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry after 47 seconds.",
    "requestId": "..."
  }
}
```

Clients must respect `Retry-After` before retrying. Clients that ignore `Retry-After` and hammer the API will have their limit window extended (sliding window penalty, not implemented in V1 but documented here as a future escalation).

---

## 9. Endpoint Catalogue

Authentication requirements and permission keys refer to `04-rbac-permissions.md`. `IK` = `Idempotency-Key` header required.

### Identity & Access

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `POST` | `/v1/auth/register` | Public | — | — |
| `POST` | `/v1/auth/login` | Public | — | — |
| `POST` | `/v1/auth/refresh` | Public (cookie or body) | — | — |
| `POST` | `/v1/auth/logout` | Bearer | — | — |
| `POST` | `/v1/auth/forgot-password` | Public | — | — |
| `POST` | `/v1/auth/reset-password` | Public (token in body) | — | — |
| `POST` | `/v1/auth/verify-email` | Public (token in body) | — | — |
| `GET` | `/v1/users/me` | Bearer | — | — |
| `PATCH` | `/v1/users/me` | Bearer | — | — |

### Staff & Roles

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `POST` | `/v1/organizations/:orgId/invites` | Bearer | `staff:invite` | — |
| `GET` | `/v1/organizations/:orgId/invites` | Bearer | `staff:invite` | — |
| `DELETE` | `/v1/organizations/:orgId/invites/:inviteId` | Bearer | `staff:invite` | — |
| `GET` | `/v1/organizations/:orgId/members` | Bearer | `staff:assign_role` | — |
| `PATCH` | `/v1/organizations/:orgId/members/:userId/role` | Bearer | `staff:assign_role` | — |
| `DELETE` | `/v1/organizations/:orgId/members/:userId` | Bearer | `staff:remove` | — |
| `POST` | `/v1/invites/accept` | Public (token in body) | — | — |
| `GET` | `/v1/roles` | Bearer | `role:create_custom` | — |
| `POST` | `/v1/organizations/:orgId/roles` | Bearer | `role:create_custom` | — |
| `PATCH` | `/v1/organizations/:orgId/roles/:roleId` | Bearer | `role:edit_custom` | — |

### Facilities & Resources

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `POST` | `/v1/organizations/:orgId/facilities` | Bearer | `facility:create` | — |
| `GET` | `/v1/facilities/:id` | Public | — | — |
| `PATCH` | `/v1/facilities/:id` | Bearer | `facility:edit_details` | — |
| `PATCH` | `/v1/facilities/:id/hours` | Bearer | `facility:edit_hours` | — |
| `PATCH` | `/v1/facilities/:id/payment-config` | Bearer | `facility:edit_payment_config` | — |
| `PATCH` | `/v1/facilities/:id/pricing` | Bearer | `facility:edit_pricing` | — |
| `POST` | `/v1/facilities/:id/resources` | Bearer | `resource:create` | — |
| `GET` | `/v1/facilities/:id/resources` | Public | — | — |
| `PATCH` | `/v1/resources/:id` | Bearer | `resource:edit` | — |
| `GET` | `/v1/resources/:id/slots` | Public | — | — |
| `POST` | `/v1/resources/:id/slots/:slotId/block` | Bearer | `resource:block_slot` | — |
| `DELETE` | `/v1/resources/:id/slots/:slotId/block` | Bearer | `resource:block_slot` | — |

### Search

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `GET` | `/v1/search/facilities` | Public | — | — |

Query parameters for search: `lat`, `lng`, `radius` (km), `sport`, `minPrice`, `maxPrice`, `date`, `cursor`, `limit`.

### Booking

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `POST` | `/v1/bookings` | Bearer | `booking:create` | ✓ |
| `GET` | `/v1/bookings` | Bearer | `booking:view_own` | — |
| `GET` | `/v1/bookings/:id` | Bearer | `booking:view_own` or `booking:view_facility` | — |
| `POST` | `/v1/bookings/:id/cancel` | Bearer | `booking:cancel_own` or `booking:cancel_any` | — |
| `POST` | `/v1/bookings/:id/check-in` | Bearer | `booking:mark_noshow` (staff only) | — |
| `GET` | `/v1/facilities/:id/bookings` | Bearer | `booking:view_facility` | — |

### Payments

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `POST` | `/v1/payments/intent` | Bearer | `payment:make` | ✓ |
| `GET` | `/v1/payments/:id` | Bearer | `payment:make` (own) or `platform:view_all_bookings` | — |
| `POST` | `/v1/refunds` | Bearer | `payment:refund_issue` | ✓ |
| `POST` | `/v1/webhooks/payment-provider` | Public (signature-verified) | — | — |

### Payouts

| Method | Path | Auth | Permission | IK |
|---|---|---|---|---|
| `GET` | `/v1/organizations/:orgId/payouts` | Bearer | `payout:view` | — |
| `POST` | `/v1/payouts/:id/release` | Bearer | `payout:release` (platform-only) | — |

### File Uploads

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/v1/uploads/presign` | Bearer | Returns a presigned S3 URL. Client uploads binary directly to S3 — binary never passes through the API server. |

Request body: `{ "resource": "facility-image", "contentType": "image/jpeg" }`. Response: `{ "uploadUrl": "...", "key": "..." }`. After upload, client sends the `key` when updating the facility's `imagesJson`.

### Platform Admin

| Method | Path | Auth | Permission |
|---|---|---|---|
| `GET` | `/v1/admin/facilities` | Bearer | `platform:approve_facility` |
| `POST` | `/v1/admin/facilities/:id/approve` | Bearer | `platform:approve_facility` |
| `POST` | `/v1/admin/facilities/:id/suspend` | Bearer | `platform:suspend_facility` |
| `GET` | `/v1/admin/bookings` | Bearer | `platform:view_all_bookings` |
| `POST` | `/v1/admin/refunds` | Bearer | `platform:issue_refund_override` |

---

## 10. CORS & Security Policy

### Allowed origins

```
https://sfbs.io                  (Next.js consumer — SSR + CSR)
https://app.sfbs.io              (React owner/admin dashboard)
http://localhost:3001            (local Next.js dev)
http://localhost:5173            (local React SPA dev)
```

CORS config is environment-variable-driven. The production allowlist must be exact — no wildcard origins on `credentials: true` endpoints (browsers will reject it regardless).

Mobile Flutter clients are native HTTP callers — CORS does not apply.

### CORS options

```
Access-Control-Allow-Credentials: true     (required for refresh-token cookie on web)
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key, X-Request-ID
Access-Control-Max-Age: 600
```

State-changing requests using the refresh-token cookie must include `X-CSRF-Token` header validated server-side (double-submit cookie pattern). `SameSite=Strict` on the cookie provides primary CSRF defense; CSRF token is belt-and-suspenders.

---

## 11. Webhook Design

### Inbound — payment provider → SFBS

```
POST /v1/webhooks/payment-provider

Headers:
  Stripe-Signature: t=...,v1=...   (or provider-equivalent HMAC header)
  Content-Type: application/json

Body: raw bytes (signature verified against raw body before JSON parse)
```

Processing rules:
1. Verify signature against raw request body using provider's HMAC secret. Reject with `400` if invalid; log to security audit, not to `payment_webhook_events`.
2. Parse payload and insert into `payment_webhook_events (provider, provider_event_id, payload_json, received_at)` — idempotent due to `UNIQUE (provider, provider_event_id)` constraint.
3. Return `200` immediately. Do not process synchronously.
4. Relay worker picks up the event, processes it, and updates `processed_at`.
5. If processing fails repeatedly, event parks in DLQ. Alert fires when DLQ depth > 0.

The endpoint must always return `200` to a verified webhook — returning `5xx` causes the provider to retry, which is correct behavior, but returning `200` on a persisted-but-not-yet-processed event is safe because processing is idempotent.

### Outbound — SFBS → owner integrations (reserved, not V1)

Owner webhook delivery is not built in V1 but the pattern is reserved here to avoid later conflicts:

```
POST <owner_webhook_url>

Headers:
  X-SFBS-Signature: sha256=<hmac-sha256 of body using per-owner secret>
  X-SFBS-Event: booking.confirmed
  X-SFBS-Delivery-ID: <uuid>
  X-SFBS-Timestamp: 1726431600
  Content-Type: application/json
```

Delivery: up to 5 attempts with exponential backoff (1s, 5s, 30s, 5min, 30min). After 5 failures, mark delivery failed and alert owner in dashboard. Signature format mirrors GitHub's webhook pattern — well-understood by integration developers.

---

## 12. Multi-Client Versioning Considerations

| Client | Force-updatable? | Strategy |
|---|---|---|
| Flutter (iOS) | No — app store review lag | Must handle N-1 API version. Inspect `Sunset` header and surface upgrade prompt. |
| Flutter (Android) | No — Play store review lag | Same as iOS. |
| Next.js consumer | Yes — server-deployed | Always runs against latest. SSR calls API server-side; no stale client bundle issue. |
| React SPA (dashboard) | Yes — CDN-deployed | Always runs against latest. |

### Backward compatibility rules

- **Non-breaking** (no version bump required): adding optional request fields, adding response fields, adding new endpoints, adding new enum values to existing fields.
- **Breaking** (requires new `/v2/` route): removing or renaming response fields, changing field types, changing required fields, removing endpoints.
- **Client obligation**: clients must deserialize JSON leniently — unknown fields are silently ignored, not rejected. This is how response extensions remain non-breaking.
- **Sunset obligation**: Flutter clients must read `Sunset` response headers on every authenticated request. If `Sunset` is within 30 days, prompt user to update the app. If `Sunset` has passed and the route is gone, present a forced-upgrade screen.

### API version header (informational, not for routing)

```
X-API-Version: 1                 (response header, set by server)
```

Clients may log this for debugging. It is not used for routing decisions — URL prefix handles routing.

---

## 13. OpenAPI Specification Strategy

**Tooling**: `@nestjs/swagger` — decorators on DTOs and controllers auto-generate the spec.

**Spec file**: `apps/api/openapi.json` committed to the repository. Generated during CI; if the committed spec doesn't match the generated one, CI fails. This prevents undocumented API drift.

**Local docs**: `GET /v1/docs` serves Swagger UI in `development` and `staging` environments. Disabled in `production`.

**Flutter client generation**: The committed OpenAPI spec is the input to `openapi-generator-cli` (or `openapi_generator` Flutter package). Run during Flutter project setup to generate typed HTTP client code. API changes without a spec commit will not reach the Flutter client automatically — this is intentional.

### Required annotations

Every public controller method must have:

```typescript
@ApiOperation({ summary: 'Brief one-line description' })
@ApiResponse({ status: 200, type: BookingResponseDto })
@ApiResponse({ status: 400, description: 'VALIDATION_FAILED' })
@ApiResponse({ status: 403, description: 'PERMISSION_DENIED' })
// ... relevant error codes
```

Every DTO field must have:

```typescript
@ApiProperty({ description: 'Slot UUID to book', example: '550e8400-...' })
@IsUUID()
slotId: string;
```

---

## 14. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| URL paths | kebab-case, plural nouns | `/v1/booking-status-history` |
| URL path params | camelCase | `/v1/resources/:resourceId/slots` |
| URL query params | camelCase | `?minPrice=1000&sportType=football` |
| JSON request/response fields | camelCase | `{ "startTime": "...", "slotId": "..." }` |
| Error codes | SCREAMING_SNAKE_CASE | `SLOT_ALREADY_HELD` |
| Event names (RabbitMQ) | dot.notation | `booking.confirmed` |
| Enum values in JSON | camelCase string | `{ "status": "pendingPayment" }` |
| Timestamps | UTC ISO 8601 with milliseconds and Z | `"2026-09-15T16:45:00.000Z"` |
| Currency amounts | Integer minor units | `{ "amount": 150000, "currency": "PKR" }` |
| Boolean fields | Plain boolean, no `is` prefix in JSON | `{ "verified": true }` |

### Currency amounts — detail

All monetary values are transmitted as **integers in minor currency units** (paisas for PKR, cents for USD). The `currency` field always accompanies `amount`. Never transmit floats for money.

```jsonc
// Correct
{ "amount": 150000, "currency": "PKR" }   // 1,500.00 PKR

// Wrong — never do this
{ "amount": 1500.00, "currency": "PKR" }
```

The database stores `numeric(12,2)` — the API layer converts on serialization/deserialization. Rounding is always `ROUND_HALF_UP`.

---

## 15. Security Headers

Applied globally via `@nestjs/helmet`:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'
X-XSS-Protection: 0       # Intentionally 0 — CSP is the real defense; legacy header can cause issues
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
```

`Content-Security-Policy` is relaxed per environment:
- **API server**: `default-src 'self'` (no HTML served, so CSP is a safety net only)
- **Next.js consumer**: Configured in Next.js `next.config.js` headers, not in the NestJS API
- **React SPA**: Configured in the SPA's hosting/CDN layer

---

## Appendix A — Booking Flow API Sequence

```
1. GET /v1/resources/:id/slots?from=2026-09-16&to=2026-09-16
   → list of open slots with start_time, end_time, price

2. POST /v1/bookings
   Idempotency-Key: <client uuid>
   { "slotId": "uuid", "paymentMethod": "online" }
   → 201 { "data": { "bookingId": "...", "holdToken": "...", "holdExpiresAt": "...", "paymentIntentClientSecret": "..." } }

3. Client completes payment via provider SDK using paymentIntentClientSecret

4. Provider sends webhook → POST /v1/webhooks/payment-provider
   → booking transitions to confirmed asynchronously
   → booking.confirmed event published → email/SMS notification sent

5. GET /v1/bookings/:id → { "status": "confirmed" }
```

---

## Appendix B — Error Handling Decision Tree (for client implementors)

```
HTTP response received
│
├── 2xx → success, parse data field
│
├── 400 VALIDATION_FAILED → show field-level errors from error.details
├── 401 TOKEN_EXPIRED → silent refresh (POST /auth/refresh), retry once
├── 401 REFRESH_TOKEN_REUSE_DETECTED → force logout, redirect to login
├── 401 any other → redirect to login
├── 403 PERMISSION_DENIED → show "not authorized" UI
├── 404 → show "not found" UI; do not distinguish missing vs wrong-tenant
├── 409 IDEMPOTENCY_CONFLICT → bug in client; log and surface generic error
├── 409 SLOT_ALREADY_HELD / SLOT_ALREADY_BOOKED → "slot no longer available, pick another"
├── 422 → show business rule message from error.message
├── 429 → respect Retry-After; show "too many requests" and disable retry UI
├── 500 → show generic error; log error.requestId for support
└── 503 → show "service temporarily unavailable"; respect Retry-After
```
