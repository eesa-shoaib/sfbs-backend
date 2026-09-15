# RBAC & Permissions

## Model

- One active non-player role assignment per user account. Enforce with a partial unique index on `user_id` where `revoked_at IS NULL`; `account_type` is classification only and never grants permission. A user cannot hold owner/staff/admin roles simultaneously.
- Roles are permission bundles: `roles` + `permissions` + `role_permissions` (many-to-many).
- System roles (`is_system_role = true`) are fixed platform-wide (Player, Owner, Admin, Support).
- Custom roles (`organization_id` set) are defined by facility owners for their own staff.
- Permission checks are **scoped**, not global: `user_role_assignments.scope_type` is `global`, `organization`, `facility`, or `resource`, with `scope_id` pointing at the actual row. Organization scope inherits to its facilities/resources; facility scope inherits to its resources. This supports today's need (facility-level staff) and tomorrow's need (court-level staff) without a schema change.
- `permissions.is_platform_only` prevents an owner's custom-role builder from ever offering platform-level permissions (payout release, facility suspension, etc.), regardless of the UI.

## Permission key taxonomy

Format: `domain:action`, lowercase, colon-separated.

| Domain | Key | Scope | Platform-only |
|---|---|---|---|
| Staff | `staff:invite` | facility/org | No |
| Staff | `staff:assign_role` | facility/org | No |
| Staff | `staff:remove` | facility/org | No |
| Role | `role:create_custom` | org | No |
| Role | `role:edit_custom` | org | No |
| Facility | `facility:create` | org | No |
| Facility | `facility:edit_details` | facility | No |
| Facility | `facility:edit_payment_config` | facility | No |
| Facility | `facility:edit_pricing` | facility | No |
| Facility | `facility:edit_hours` | facility | No |
| Facility | `facility:deactivate` | facility | No |
| Facility | `facility:view_analytics` | facility | No |
| Resource | `resource:create` | facility | No |
| Resource | `resource:edit` | facility/resource | No |
| Resource | `resource:block_slot` | facility/resource | No |
| Booking | `booking:create` | self | No |
| Booking | `booking:view_own` | self | No |
| Booking | `booking:view_facility` | facility | No |
| Booking | `booking:cancel_own` | self | No |
| Booking | `booking:cancel_any` | facility | No |
| Booking | `booking:mark_noshow` | facility | No |
| Booking | `booking:reschedule` | facility | No |
| Payment | `payment:make` | self | No |
| Payment | `payment:refund_issue` | facility | No |
| Payout | `payout:view` | facility/org | No |
| Payout | `payout:release` | — | **Yes** |
| Review | `review:create` | self | No |
| Review | `review:moderate` | facility | No |
| Platform | `platform:approve_facility` | — | **Yes** |
| Platform | `platform:suspend_facility` | — | **Yes** |
| Platform | `platform:manage_permissions` | — | **Yes** |
| Platform | `platform:view_all_bookings` | — | **Yes** |
| Platform | `platform:issue_refund_override` | — | **Yes** |

Notes:
- `self`-scoped permissions don't use `user_role_assignments` at all — enforcement is a direct `record.user_id == requester.id` check, not a scope lookup.
- `booking:cancel_any` is deliberately separate from `booking:cancel_own` so staff overrides can bypass the customer cancellation-policy window without contaminating the customer-facing logic.
- `facility:edit_payment_config` is required for toggling `accepted_payment_methods` and `cash_booking_policy` at the facility level. This is part of the cash-heavy market support path, not a payment provider credential change.
- `booking:mark_noshow` is part of the facility-facing staff flow for grace-period enforcement. It is not a customer self-service permission.
- Never implement wildcard permission matching (`facility:*`) in the actual authorization check — only as a UI convenience that inserts explicit rows. Wildcards in the check path are a common privilege-escalation bug source.

## Cash-booking policy controls

Cash payments are not a separate auth domain; they are an extension of facility-scoped authorization and booking enforcement:

- owner/staff with `facility:edit_payment_config` may set `accepted_payment_methods` and `cash_booking_policy`.
- owner/staff with `booking:mark_noshow` may trigger the no-show workflow after `in_grace` expiry.
- `booking:create` remains user self-service; the backend still enforces the facility's payment policy before confirmation.
- `payment:make` is only valid for `online` or `cash_fee` booking paths; a `cash_free` booking never creates a platform-side payment capture from the customer.

## Staff onboarding flow

Pure open self-registration is unsafe (facility enumeration, request spam, approval fatigue). V1 uses **invite-token-gated self-registration**:

1. Owner (with `staff:invite` permission) generates an opaque random, expiring token. Only its hash is stored. Invite is pre-bound to `organization_id`, `scope_type`, `scope_id`, and suggested `role_id`.
2. Invite sent via email or shareable link. Token: single-use, ~7 day expiry, invalidated on first use.
3. Recipient clicks the link and does the self-service part (name, password, profile) — but cannot choose which facility/org they're joining; that's locked into the token.
4. On redemption: if email has no account, create user (`account_type = staff`). If verified existing user is a player with no active non-player role, require authenticated acceptance, attach assignment, and update classification to `staff`; preserve booking history. Reject existing owner/staff/admin account with active role. Mark `staff_invites.used_at` atomically.

Validate that invite role belongs to invite organization and that facility/resource scope belongs to same organization. Polymorphic `scope_id` cannot enforce this with one database foreign key.

Authorization integration tests must cover every scope inheritance path and reject mismatched `scope_type`/`scope_id` pairs. This validation is security-critical because database foreign keys cannot model polymorphic scope safely.

## Tenant isolation

Every facility/resource/booking/payment query accepts organization context derived from authorized target, then verifies ownership through joins (`resource -> facility -> organization`). Never trust organization/facility ID supplied by client without this check. Repository integration tests must prove a user from Organization A cannot read, modify, cancel, refund, or infer records from Organization B.

## Authorization source of truth

`user_role_assignments` plus permission rows are sole authorization source. `account_type` is for onboarding/UI classification only; never use it as an authorization bypass.

## Enforcement pattern

- JWT stays thin: `{ sub: user_id, account_type, token_version }`. No permissions embedded.
- Guard reads `user_id` from JWT + target `scope_id` from the route, checks Redis key `perms:{user_id}` (cached set of permission/scope tuples).
- Cache miss → query Postgres, repopulate with short TTL.
- On staff reassignment/revocation, invalidate that user's Redis key. On role or role-permission edit, find every active assignment using that role and invalidate every affected user's key. This makes revocation immediate, not eventually consistent.
