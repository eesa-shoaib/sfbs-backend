# Auth & Token Flow

## Strategy
Stateless JWT access tokens + refresh token rotation, with Redis-backed permission checks (not embedded-in-JWT permissions) so access revocation is instant. See `04-rbac-permissions.md` for the permission-check mechanics.

## Client storage and recovery

- Web stores refresh token only in `HttpOnly`, `Secure`, `SameSite` cookie. State-changing cookie-authenticated requests require CSRF token validation; configure strict CORS allowlist.
- Mobile stores refresh token in OS secure storage. Never use localStorage for refresh tokens.
- Password reset uses single-use hashed `password_reset_tokens`, short expiry, rate limits, and token-family revocation after password change. Email verification required before staff invite acceptance and before sensitive account changes.

## Token lifecycle

1. **Login** — verify credentials (argon2/bcrypt hash compare), check `users.status = active`. Rate-limit login attempts per email/IP.
2. **Issue token pair**
   - Access token: `{ sub: user_id, account_type, token_version, iat, exp }`, ~15 min expiry.
   - Refresh token: long random string, ~7 day expiry, stored **hashed** in `refresh_tokens` (never store raw). Every rotation family has one `family_id`.
3. **API request**
   - Verify JWT signature + expiry.
   - Compare `token_version` in JWT against current `users.token_version` — mismatch means force-reject even if the signature is valid (this is the "log out everywhere" kill switch).
   - Redis permission lookup (`perms:{user_id}`) for the actual authorization decision.
4. **Refresh rotation** (on access token expiry)
   - Client presents refresh token.
   - Server looks up hash in `refresh_tokens`; if `revoked_at` is already set, treat as a **theft signal** — revoke every row with same `family_id` and force re-login everywhere, don't just reject single request.
   - Otherwise: mark presented refresh token `revoked_at = now()`, issue brand-new access + refresh pair, store new refresh token hash with same `family_id`.
5. **Logout / revoke**
   - Delete/revoke the refresh token row.
   - Clear the Redis permission cache for that user.
   - Optionally bump `users.token_version` to force logout on all devices (used for "staff removed" or suspected compromise, not routine logout).

## Why this shape

- Keeping permissions out of the JWT avoids staleness — an owner editing a custom role or firing staff takes effect on the next request, not "whenever the token expires."
- Refresh rotation with reuse-detection is what turns a leaked refresh token from a silent long-term compromise into a detected, contained incident.
