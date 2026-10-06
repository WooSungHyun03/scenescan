# Account-backed shortlist

SceneScan keeps the existing browser shortlist for guests and switches to an account-backed shortlist after a fresh Supabase user is available. The UI contract remains `useShortlist()`/`ShortlistButton`; components do not query Supabase directly.

## Storage and API contract

Migration `20261006000000_user_shortlist.sql` creates `public.user_shortlist` with:

- primary key `(user_id, location_id)`, so repeated saves and imports cannot duplicate a location;
- `user_id -> auth.users(id) on delete cascade`, so account deletion removes only that user's shortlist rows;
- `location_id -> public.locations(id) on delete cascade`, so a removed catalog location cannot leave a stale account row;
- owner-only SELECT/INSERT/DELETE RLS using `auth.uid() = user_id` and no anonymous policy.

`GET /api/shortlist` lists the freshly verified session owner's IDs. `PUT /api/shortlist` accepts the strict desired-state body `{ "locationId": "<uuid>", "saved": true|false }`. `POST /api/shortlist` accepts `{ "locationIds": ["<uuid>"] }` for the one-time, consented browser merge. No endpoint accepts `userId`; the server obtains it through verified claims plus `getUser()`, and RLS independently checks it again.

Mutation requests require same-origin `Origin`/Fetch Metadata and `X-SceneScan-CSRF: shortlist-write-v1`. Every response is private/no-store and varies on Cookie and Origin.

## Browser migration and account changes

Guest IDs remain under `scenescan.shortlist.location-ids.v1`. Logging in does not copy them. The shortlist page presents an explicit choice. After consent, the server:

1. de-duplicates the submitted UUIDs;
2. selects only IDs that still exist in `public.locations`;
3. performs one idempotent upsert for the verified user;
4. returns the authoritative account list and invalid/deleted count.

Browser storage is removed only after the merge succeeds. A failed merge leaves both the previous account snapshot and guest storage intact for retry. Authenticated add/remove uses optimistic presentation but rolls back to the previous snapshot on a failed server response.

Account IDs are never written into localStorage. They stay in memory, synchronize to same-account tabs through `BroadcastChannel` (with a non-personal refresh signal fallback), and reload from the API on another device. Logout or an account identity change clears the in-memory account snapshot before loading the new scope. A guest list is never automatically imported into a different account.

## Deployment and verification

The deployment owner must apply `supabase/migrations/20261006000000_user_shortlist.sql` to each Supabase environment before enabling account shortlist writes. No new environment variable or service-role browser access is required; the route uses the request-scoped publishable-key client and RLS.

For local verification:

1. Start Docker Desktop and run `pnpm supabase:start`.
2. Export the four loopback values from `.env.integration.example`.
3. Run `pnpm test:integration` for real two-user RLS, duplicate merge, deleted-location cascade, and second-device reads.
4. Run `pnpm test:e2e:auth` for the browser consent and account flow.

Production migration application and a hosted two-device smoke test remain the deployment owner's responsibility.
