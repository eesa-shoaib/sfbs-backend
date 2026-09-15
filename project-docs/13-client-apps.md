# Client Applications

Four user types exist in the system (`player`, `owner`, `staff`, `admin`) served by three deployable frontends. Staff share the owner dashboard with a permission-scoped view — not a separate app. The RBAC layer controls what each user sees without requiring separate codebases.

## App Overview

| App | Platform | Users | Directory |
|---|---|---|---|
| Customer app | Flutter (iOS + Android) | Players | `apps/mobile/` |
| Customer web | Next.js | Players (web / SEO) | `apps/consumer-web/` |
| Owner & staff dashboard | React SPA | Owners, staff | `apps/owner-dashboard/` |
| Admin panel | React SPA (protected route) | SFBS internal team | `apps/owner-dashboard/admin/` |

---

## Customer App — Flutter + Next.js

Same product on two platforms. Next.js handles SSR for SEO on facility discovery pages. Flutter handles the native booking and payment experience on iOS and Android.

**Scope:**

- Register, login, email verification, password reset
- Search facilities by location, sport type, price range, date (geo + filters via PostGIS)
- View facility details, resources, and available slots
- Book a slot — online payment or cash (per facility payment policy)
- View own bookings: upcoming, past, cancelled
- Cancel a booking within the cancellation policy window
- Receive booking confirmation and cancellation notifications (email + SMS)
- View cancellation policy before confirming a booking
- Visibility of no-show count and threshold (self-service awareness)

**Permissions used:** `booking:create`, `booking:view_own`, `booking:cancel_own`, `payment:make`

**Deferred (table/backend ready):** `review:create` — unlocked when reviews feature is activated.

---

## Owner Dashboard — React SPA

Web-only. Owners and their staff use this from a browser. No mobile version in V1.

### Owner scope

- Onboard organization and facility, submit for platform approval
- Add and edit resources (courts, fields) — sport type, slot duration, attributes
- Configure operating hours and exceptions (holidays, closures)
- Set pricing per resource
- Configure payment methods (`online`, `cash_fee`, `cash_free`) and grace period
- Invite staff via token-gated invite link, assign roles scoped to facility or resource
- Create and edit custom staff roles
- View all bookings for their facilities — upcoming, past, cancelled, no-shows
- Cancel bookings on behalf of customers
- View payout history and KYC / payout eligibility status
- Issue refunds (within their facility scope)

**Permissions used:** `facility:create`, `facility:edit_details`, `facility:edit_hours`, `facility:edit_pricing`, `facility:edit_payment_config`, `facility:deactivate`, `facility:view_analytics`, `resource:create`, `resource:edit`, `resource:block_slot`, `staff:invite`, `staff:assign_role`, `staff:remove`, `role:create_custom`, `role:edit_custom`, `booking:view_facility`, `booking:cancel_any`, `booking:mark_noshow`, `booking:reschedule`, `payment:refund_issue`, `payout:view`

### Staff scope

Staff log into the same dashboard but see a scoped view determined by their role assignment (`scope_type` = `facility` or `resource`). No separate app or deploy.

**Typical staff scope:**

- View bookings for their assigned facility or resource
- Check in arriving customers
- Mark no-shows after grace period expires
- Block and unblock slots (maintenance, events)

**Permissions used (role-dependent):** `booking:view_facility`, `booking:mark_noshow`, `booking:cancel_any`, `resource:block_slot` — all scoped to assigned facility or resource, not global.

---

## Admin Panel — React SPA (protected route)

Internal tool for the SFBS platform team. Deployed as a protected route within the owner dashboard behind `is_platform_only` permission guards. No separate deploy needed in V1.

**Scope:**

- View all pending facilities, approve or suspend
- View all bookings across all organizations
- Issue override refunds
- Manage system permissions and roles
- Trigger and record manual payouts
- Manage commission settlement for cash-free facilities
- View platform-wide audit log

**Permissions used:** `platform:approve_facility`, `platform:suspend_facility`, `platform:manage_permissions`, `platform:view_all_bookings`, `platform:issue_refund_override`, `payout:release`

---

## What Each App Does Not Do

| App | Explicitly out of scope |
|---|---|
| Customer app | Cannot manage facilities, staff, or payouts |
| Owner dashboard | Cannot approve/suspend other organizations, cannot release payouts platform-wide |
| Staff view | Cannot invite other staff, cannot create roles, cannot view payouts |
| Admin panel | Not customer-facing; no booking creation or payment flows |
