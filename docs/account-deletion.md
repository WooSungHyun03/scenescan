# Safe self-service account deletion

`DELETE /api/account` is the only account-deletion boundary. It never accepts a user ID. The route obtains a fresh user through verified claims plus Supabase `getUser()`, reauthenticates that user's email with the submitted current password, requires the exact `회원탈퇴` phrase, and passes only the verified ID to the server-only Admin API.

## Request contract

```http
DELETE /api/account
Origin: https://<same application origin>
Content-Type: application/json
X-SceneScan-CSRF: account-delete-v1

{"currentPassword":"<transient>","confirmation":"회원탈퇴"}
```

The body is strict and capped at 2 KiB. Unknown fields, including `userId`, are rejected. The route also rejects a missing or foreign `Origin`, a cross-site `Sec-Fetch-Site`, and a missing custom CSRF header before opening an Auth client. The password exists only in the request and the in-memory Supabase call; it is never logged, stored, or returned.

Success is exactly `{ "deleted": true }`. The response is private/no-store, expires every Supabase Auth cookie found on the request, and sends `Clear-Site-Data: "cache", "cookies", "storage"`. The UI additionally clears the device shortlist and Auth cooldown timestamps before a full navigation to login. Any provider/admin failure returns a non-success status and leaves the local session available for an explicit retry.

## Data ownership and cascade policy

SceneScan has no profile table. The only server-side user content is `user_shortlist`, whose `user_id` references `auth.users(id) on delete cascade`; Auth deletion therefore removes those rows in the same database without a broad application cleanup query. Guest shortlist data and cooldown timestamps are cleared in the browser after confirmed deletion. Public `locations`, `location_images`, and `parking` rows are catalog data and are never queried or mutated by the deletion service.

Any future user-owned table must use a non-null owner foreign key such as `owner_id uuid references auth.users(id) on delete cascade`, with RLS limiting access to `auth.uid() = owner_id`. User-owned Storage objects do not inherit Postgres cascade behavior and require a reviewed server-side cleanup step before account deletion is enabled for that feature. Do not add a broad public-table cleanup query to this endpoint.

## Production setup and session boundary

The deployment owner must configure `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (preferred) or the legacy `SUPABASE_SERVICE_ROLE_KEY` as server-only Production variables and redeploy. Never use a `NEXT_PUBLIC_*` name. The browser receives neither the key nor the Admin API call.

Deleting the Auth record revokes refreshable login state, but SceneScan does not assume that every already-issued access JWT disappears immediately. Every personal route/API must continue to call `getVerifiedAuthUser`; a cryptographically valid but deleted user's token fails the fresh user lookup. Public location APIs remain public by design.

Local verification uses the Supabase CLI's well-known loopback service-role value from `.env.integration.example` only:

1. Start Docker Desktop and run `pnpm supabase:start`.
2. Run `pnpm test:e2e:auth`.
3. Confirm deletion redirects to login, clears the shortlist, rejects the old password, and denies `/account` even after restoring a copied pre-deletion Auth cookie.
4. Run `pnpm supabase:stop`.

Production key registration and a real hosted deletion smoke test remain the deployment owner's responsibility.
