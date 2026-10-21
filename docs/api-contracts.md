# Shared contracts

The source of truth for TypeScript shapes is `src/types/domain.ts`, `src/types/contracts.ts`, `src/types/weather.ts`, and `src/types/place-discovery.ts`. Change these and this document together.

| Operation | Input | Output | Owner |
| --- | --- | --- | --- |
| `ImageEmbeddingService.embed` | `File \| Blob`, optional `{ signal, timeoutMs }` | `Promise<number[]>`, finite length 512 | Member 1 |
| `searchByImage` / `POST /api/search` | `{ embedding: number[512], filters?: LocationFilter, threshold?: number }` | `{ results: LocationSearchResult[] }`, maximum 8 (unchanged) | Member 3 with 1 |
| `getLocations` | `LocationListQuery` (`LocationFilter` + optional `limit`/`offset`) | `Location[]` | Member 3 |
| `getLocation` | string ID | `LocationDetail \| null` | Member 3 |
| `getSimilarLocations` / `GET /api/locations/[id]/similar` | path param `id` (uuid), optional repeated `exclude` UUIDs (max 200) | `{ results: LocationSearchResult[] }`, selected and seen locations excluded, maximum 8 | Member 1 with 3 |
| `GET /api/locations` | region/category/limit/offset, or repeated `id` (max 50) | `LocationListResponse`, bounded metadata reads | Member 3 with 2 |
| `getLocationWeather` / `GET /api/locations/[id]/weather` | location UUID, optional offset-aware ISO 8601 `at` | `{ weather: LocationWeather }` | Member 3 |
| `getNearbyParking` / `GET /api/locations/[id]/parking` | location UUID, optional radius in metres (default 1000, 100–20000) | `NearbyParkingResponse`, transient PK6 candidates, maximum 5 | Member 3 with 2/4 |
| `getLocationContacts` / `GET /api/locations/[id]/contacts` | location UUID; query parameters are rejected | `LocationContactsResponse`, reviewed official contacts or at most one unconfirmed Kakao place-contact suggestion | Member 3 with 2/4 |
| `getVerifiedAuthClaims` | request-scoped Supabase auth client or `null` | verified JWT claims or `null`; never trusts `getSession()`/cookie payload alone | Member 3 with 1 |
| `getVerifiedAuthUser` | request-scoped Supabase auth client or `null` | fresh Auth user only when verified claim subject and `getUser()` id agree, otherwise `null` | Member 3 with 1 |
| Supabase `signUp` / `signInWithPassword` / `resend` / `signOut` | validated email and transient password in the browser; resend stores only a timestamp | Supabase Auth session/error; no application password persistence or profile row | Member 2 with 3 |
| `GET /auth/callback` | PKCE `code` (optional `sb_flow_id`) or `token_hash` + allowed email OTP `type`; optional allow-listed internal `next` | private/no-store redirect with refreshed Auth cookies, or a stable safe login error | Member 2 with 3 |
| Supabase `resetPasswordForEmail` | normalized email and fixed `/auth/recovery` redirect; browser stores only a 60-second request timestamp | non-enumerating UI response; provider remains the authoritative rate limiter | Member 2 with 3 |
| `GET /auth/recovery` | PKCE `code` (optional `sb_flow_id`) or `token_hash` with `type=recovery` only | private/no-store redirect to clean `/recovery`, or stable expired/invalid error with no token reflection | Member 2 with 3 |
| Supabase `updateUser` | verified recovery session + new password, or authenticated account + current/new password | password change followed by global sign-out request; no application password persistence | Member 2 with 3 |
| `DELETE /api/account` | same-origin JSON `{ currentPassword, confirmation: "회원탈퇴" }` plus fixed CSRF header; no user ID field | `{ deleted: true }` only after fresh-user/password verification and server-only Admin deletion; private/no-store and auth/browser-data cleanup | Member 3 with 2 |
| `GET /api/shortlist` | verified request session; no identity input | `{ ids: uuid[] }` for the current user; private/no-store | Member 3 with 2 |
| `PUT /api/shortlist` | same-origin `{ locationId: uuid, saved: boolean }` plus fixed CSRF header; no user ID | authoritative `{ ids: uuid[] }`; idempotent desired state | Member 3 with 2 |
| `POST /api/shortlist` | same-origin `{ locationIds: uuid[] }` (max 200), used only after browser migration consent | `{ ids, mergedCount, ignoredCount }`; existing locations only, duplicate-safe | Member 3 with 2 |
| `getSolarPosition` | `GeoPoint`, JavaScript `Date` | `SolarPosition` (degrees) | Member 4 |
| `getSolarPositionAtLocationTime` | `GeoPoint`, location-local `date`, `time`, optional IANA `timeZone` | resolved UTC `instant`, offset/ambiguity metadata, `SolarPosition`, or a validation error | Member 4 |
| `classifyLighting` | `SolarPosition`, camera heading in degrees | `LightingClassification \| null` | Member 4 |
| `sortParkingByDistance` | `GeoPoint`, `ParkingInfo[]` | `ParkingDistanceResult[]` | Member 4 |

`LocationFilter`: optional `region` (**DEPRECATED**: only `부산` validates now -- see the Busan-district contract note below), `district` (one of the 16 Busan 구/군 keys in `DISTRICT_VALUES`, `src/types/location-options.ts`), and `category` (`urban`, `nature`, `industrial`, `interior`). `POST /api/search` request validation (`searchRequestSchema`, Zod, `src/types/contracts.ts`) rejects: an `embedding` whose length isn't exactly 512, any non-finite value (`NaN`/`Infinity`) or non-number in it, an all-zero vector, an unrecognized `region`/`category`, and `threshold` outside `[0, 1]`. Unknown top-level or `filters` fields (including a client-supplied `count`, see below) are silently ignored (Zod's default "strip" behavior) rather than rejected -- matching every other schema already in this file (`locationFilterSchema`, `locationListQuerySchema`); `scripts/data`/`scripts/embeddings`'s import-time schemas use `.strict()` instead, which is a deliberate difference for a different concern (malformed *stored* data must fail loudly), not an inconsistency to fix here. The request body is also capped at `MAX_SEARCH_REQUEST_BYTES` (32KB) before it ever reaches `JSON.parse` (checked via `Content-Length` first, then the actual decoded byte length -- see `src/app/api/search/route.ts`).

`threshold` is an optional pre-aggregation candidate-retrieval knob only (`SearchQueryOptions`, `src/types/domain.ts`) -- it maps to the `match_location_images` RPC's `match_threshold` (or the equivalent filter in mock mode). It does **not** change the result count: that stays fixed at up to 8 locations, a separate, non-configurable product policy (see `docs/search-ranking.md`). Server default when omitted: 0 (`SEARCH_MATCH_THRESHOLD_DEFAULT`, `src/types/contracts.ts`). `match_count` (the RPC's candidate-window size, `SEARCH_MATCH_COUNT_DEFAULT` = 200) is **not** client-configurable -- an earlier revision of this endpoint accepted a `count` field; it was removed from the public request schema (there was no product need for a client to widen/narrow the server's own candidate window) and is now always the fixed server constant, for both plain search and similar-locations. See `src/types/contracts.ts`'s comment for why 200 (the RPC's ceiling) is the right default rather than a smaller "typical" number.

`similarity` is cosine similarity in real mode and a synthetic UI value in mock mode. Images are grouped by location using the highest image score, then sorted by descending similarity and ascending location ID for deterministic ties. Duplicate images and malformed scores are excluded (Member 1's ranker, unchanged). Region/district/category eligibility is now decided entirely by the RPC's `filter_region`/`filter_district`/`filter_category` (real mode) or by filtering mock candidates before grouping (mock mode) -- there is no longer a separate app-side "is this location in my already-filtered list" check layered on top; see the RPC section below for why this matters. `filter_region` is always the fixed `'부산'` (`BUSAN_REGION`, `src/domains/locations/server/supabase-repository.ts`), never `filters.region` -- see the Busan-district contract note below.

## Errors

Every error response is `{ error: { code, message }, requestId }`. `message` is always a Korean, user-safe sentence -- never the underlying Supabase/Postgres error text, a stack trace, SQL, or an environment variable value; those are logged server-side only (`src/shared/observability/logger.ts`), and even there, request embedding vectors and secrets are never included. This is a breaking shape change from the previous flat `{ error: string, code, requestId }` response; no current frontend code reads `code` or `error` from a failed response body (`SearchWorkspace` only checks `response.ok`), so nothing else needed to change to stay compatible.

| `code` | HTTP status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Malformed JSON, failed request validation, or an oversized body |
| `LOCATION_NOT_FOUND` | 404 | A requested location does not exist. Returned by `GET /api/locations/[id]/similar` for a well-formed but nonexistent id. (`src/app/locations/[id]/page.tsx` still uses Next's `notFound()` directly -- it is a Server Component, not this HTTP route.) |
| `UNAUTHENTICATED` | 401 | No valid Supabase claims are available; the caller must authenticate again |
| `FORBIDDEN` | 403 | The verified user exists but is not allowed to perform the operation |
| `RATE_LIMITED` | 429 | The operation is temporarily throttled; the response includes an integer `Retry-After` header |
| `DATA_UNAVAILABLE` | 503 | The server could not reach the data it needed -- missing Supabase configuration or a live DB/RPC failure. Both collapse to this one public code; the client has no use for the internal distinction |
| `SEARCH_FAILED` | 500 | Any other unexpected failure during search |

`src/shared/errors/application-error.ts` provides one constructor per code (`validationError`, `notFoundError`, `unauthenticatedError`, `forbiddenError`, `rateLimitedError`, `configurationError`/`dataAccessError`, and the `toApplicationError` catch-all that produces `SEARCH_FAILED`) rather than a new parallel error system -- `apiErrorResponse` (`src/shared/http/api-error-response.ts`) is the single place that turns any of them into the JSON shape above. All API error responses are `no-store`; 401/403 responses additionally use the shared private-cache policy and `Vary: Cookie`.

## Supabase Auth and cache contract

Account password updates first call fresh `getUser()` and explicitly
`signInWithPassword` using that verified user's email and the current password.
Only a matching returned user ID permits `updateUser`; wrong credentials or a
missing/mismatched identity leave the password unchanged. Passing
`current_password` alone is insufficient on provider configurations that do
not enforce it. Recovery updates retain the verified recovery-session path.

`NEXT_PUBLIC_SUPABASE_URL` plus `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` enables browser/request Auth. `NEXT_PUBLIC_SUPABASE_ANON_KEY` remains a browser-safe legacy fallback; a publishable key wins when both are set. Neither key is an admin credential. `SUPABASE_SECRET_KEY` and the legacy service-role key remain server-only and are rejected under any `NEXT_PUBLIC_*` name.

The browser client uses PKCE, durable cookie-backed sessions, and one singleton within a browser tab. Every server request creates a fresh `@supabase/ssr` server client. `proxy.ts` refreshes cookies and calls `getClaims()` early, but the proxy is not an authorization boundary: protected server operations must call `getVerifiedAuthClaims`/`requireVerifiedAuthClaims`, and operations needing the latest user record use `getVerifiedAuthUser`. Direct cookie parsing and `getSession()` user data are not accepted as identity evidence. Auth cookie names, verified identities, and auth `Set-Cookie` responses trigger `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Pragma: no-cache`, `Expires: 0`, and `Vary: Cookie`.

`/signup`, `/login`, `/forgot-password`, `/recovery`, and `/account/security` validate normalized email and/or 8–72 character passwords in the browser, then pass credentials to Supabase Auth. Password fields are uncontrolled, cleared after every attempt, and never stored in React state, local/session storage, logs, or a database table. `DELETE /api/account` receives the current password transiently because privileged deletion requires server-side reauthentication; it applies a 2 KiB cap, never logs the body, and forwards the value only to `signInWithPassword` for the latest verified user's email. Signup with email confirmation enabled enters an explicit pending state; login maps `email_not_confirmed` separately and offers resend. Forgot-password always uses the same account-neutral success sentence. Browser storage contains separate confirmation/recovery timestamps only for 60-second UI cooldowns while Supabase remains the authoritative rate limiter. There is no `profiles` table.

The callback redirect allow-list consists of `/`, `/account`, `/account/security`, `/search`, `/shortlist`, and UUID-shaped `/locations/:id` paths, with query strings allowed. It rejects absolute/protocol-relative URLs, backslashes, API/auth callback destinations, and unlisted paths; an invalid value falls back to `/account?confirmed=1`. Provider errors are reduced to stable callback/recovery expired or invalid messages, never reflected verbatim. `/account`, `/account/security`, and `/recovery` are dynamic and require `getVerifiedAuthUser`; public search and detail pages remain accessible without Auth. Authenticated account password changes send `current_password` for reauthentication. A successful change requests global sign-out and requires a new login; if global cleanup is unconfirmed, the local session is still removed and the login notice does not claim other devices were signed out.

Account deletion requires an exact request `Origin` equal to the application origin, an optional Fetch Metadata value of `same-origin` when supplied by the browser, `Content-Type: application/json`, and `X-SceneScan-CSRF: account-delete-v1`. The strict body accepts only `currentPassword` and the exact `회원탈퇴` phrase, so a client-supplied `userId` is invalid. The server repeats claims plus fresh `getUser()` verification, reauthenticates that user's email, compares the returned user ID, and only then calls `auth.admin.deleteUser(verifiedId, false)`. Admin/configuration failures are 503 and never produce `{ deleted: true }`; retry remains possible. Success expires Supabase cookies and clears cache/cookies/storage. A stale pre-deletion JWT is not assumed revoked: every personal endpoint must still require a fresh user lookup. `user_shortlist` rows cascade from `auth.users`; public catalog tables remain untouched. See [Account deletion](account-deletion.md).

Shortlist APIs also require a fresh user and never accept an owner ID. `PUT` expresses the desired saved state rather than a non-idempotent toggle. `POST` is reserved for explicit guest-browser migration consent: it de-duplicates at most 200 UUIDs, retains only IDs that still exist in `locations`, and upserts on `(user_id, location_id)`. Mutations require `X-SceneScan-CSRF: shortlist-write-v1` plus same-origin metadata. All responses are private/no-store and vary on Cookie/Origin. The browser never stores account IDs in localStorage; failed writes roll back the optimistic snapshot, while logout/account changes clear it. See [Account-backed shortlist](account-shortlist.md).

Account deletion (2 KiB) and shortlist mutations (16 KiB) enforce their existing
body limits on actual streamed bytes, before JSON parsing or Auth/DB access.
An absent/understated Content-Length never bypasses the cap. Excess input cancels
the reader without awaiting an untrusted source's cancellation promise, then
releases its lock. A split UTF-8 sequence is decoded correctly and exact-limit
bodies remain accepted. Oversize/unreadable input returns private/no-store 400
`VALIDATION_ERROR`; raw transport errors and request content never enter logs or
responses. These two routes share `readBoundedRequestText`; search routes retain
their independent existing caps and contracts.

`LocationListQuery` extends `LocationFilter` with `limit`/`offset` for bounded browse reads (`getLocations` and `GET /api/locations`). Default limit is 20, capped at 50, offset defaults to 0. `locationListQuerySchema` rejects negative/non-integer/over-limit values; repositories also clamp defensively through `resolveLocationListPagination`. Both repositories order by name and then ID. Search remains fixed Top 8; similar exploration passes already-seen IDs rather than exposing an arbitrary count.

`getLocation` never throws for a missing image or parking row on an otherwise-valid location: `src/domains/locations/server/supabase-mappers.ts`'s `toLocation` drops any image/parking sub-row missing a required field (id, image_url, or for parking name/latitude/longitude), returning it in a separate `warnings` array that the repository logs via `logger.warn` instead of failing the request. Solar position is not part of `LocationDetail` and is never read from or computed by the repository -- `SolarPosition` is computed entirely client-side by `getSolarPosition` (Member 4) from `location.point` and an absolute `Date` instant. UI date/time inputs first pass through `getSolarPositionAtLocationTime`/`locationDateTimeToInstant`; the current Korean catalog defaults to `Asia/Seoul`, never the browser system zone. The resolver rejects invalid and DST-skipped wall times and chooses the earlier instant for a repeated DST fall-back time. A future location-specific IANA zone can be supplied without changing the solar math or adding it to the frontend itself.

`Location` and each `LocationImage` carry `source`, `sourceUrl`, `author`, `license`, `licenseUrl`, and `lastVerifiedAt` as nullable fields. Location metadata uses the canonical location provenance source and links to its official or Wikidata record. Image metadata is joined by stable image UUID from `data/production/image-licenses.json`, so every selected gallery image can show its own source page, author, license, and verification date. Consumers allow missing text and render only `http:` or `https:` URLs as links. The public mapper and display boundary reject URL userinfo, backslashes and embedded control characters; rejected provenance URLs become `null` and are never displayed as raw source-label fallback text. Root-relative mock image paths remain supported, but network paths are rejected. Malformed sub-resource warnings log only field/reason and location ID, never the raw row. This display policy is not an SSRF allowlist for server fetching.

`Location.permit` carries `type`, nullable `contactName`/`contactPhone`/`note`, plus permit-specific `source`, `sourceUrl`, `referenceDate`, and `lastVerifiedAt`. These fields come from canonical `permit.provenance` and are independent from the general location source. A representative switchboard is labelled as such and must not be presented as a filming approval desk. Missing contact metadata remains `null`; clients show an honest fallback and never manufacture a phone number. The permit panel warns when the source reference date or verification timestamp is more than 365 days old.

`ImageEmbeddingService` also exposes `getStatus()`, `subscribe(listener)`, and a bounded `getPerformanceSnapshot()`. Status is one of `idle`, `loading`, `ready`, or `error`; loading status can include progress from 0 to 100. Real-mode performance samples split worker queue, decode, model wait, inference, worker total, and main-thread transfer/queue time, record the actual `wasm`/`webgpu` device, retain only the latest 20 completed requests, and never include image bytes or embeddings. Mock mode returns an empty snapshot. Both modes accept JPEG, PNG, and WebP inputs with the limits documented in `docs/architecture.md`. The default inference timeout is 120 seconds.

Cancellation is checked before decode and after each asynchronous worker stage.
If cancelled during decode/model loading, inference is skipped; already-running
inference is not preempted, but its result/error is discarded. Other pending
requests continue on the same worker and reuse its model. Unknown/settled IDs
cannot accumulate cancellation markers. Mock mode also rejects with `AbortError`
when cancellation occurs during its asynchronous byte read.

`classifyLighting` returns `back-light` when the camera points within 45 degrees of the sun, `front-light` when the sun is within 45 degrees of directly behind the camera, and `side-light` for the angles between them. It returns `null` when the sun is below the horizon or either heading is not finite. The UI translates these values to 순광, 측광, and 역광 without duplicating the angular thresholds.

`getSolarDayTimesAtLocationDate` resolves the chosen date at location-local noon before calling the installed SunCalc 1.9 API. It returns nullable sunrise/sunset UTC instants under the shared `SolarDayTimes` type, never device-local calendar parsing. Detail displays the times in the location's explicit IANA zone once a date is selected, even without a shooting hour; invalid dates/zones and polar missing events never produce invented times. Values are labelled as astronomical calculations, not KMA observations or terrain-aware visibility predictions.

`sortParkingByDistance` calculates straight-line distance from the location point, sorts nearest first without mutating the input, and returns `null` distance for invalid coordinates. `ParkingInfo.relationship` is the reviewed `on_site`/`nearby` classification; `locationId` is the location whose detail page owns the option and is not used to infer that classification. Each parking row carries nullable `sourceUrl`, `referenceDate`, and `lastVerifiedAt`; the UI sanitizes the URL, links the official record, and shows the verification/reference date. Nearby parking remains public/private-neutral when the official source does not distinguish it.

## `GET /api/locations/[id]/weather`

Returns one KMA observation or forecast for a location. The optional `at` query parameter must be an ISO 8601 timestamp with an explicit UTC offset. Omitting it means the server's current instant. The adapter interprets every KMA base and forecast timestamp in Korea Standard Time (`UTC+09:00`) and returns ISO strings with `+09:00`.

- From one hour in the past through the current instant, it selects `getUltraSrtNcst` (`purpose: "observation"`). Future requests through six hours select `getUltraSrtFcst`; later requests through four days select `getVilageFcst`. Requests outside those bounds return `VALIDATION_ERROR`.
- The publication gates are observation base `HH:00 + 40 minutes` and ultra-short base `HH:30 + 15 minutes`, as specified by the official service guide; short bases `02/05/08/11/14/17/20/23:00` use a conservative 10-minute processing allowance. Before a gate, the previous released base is used, including across Korean midnight.
- `temperatureCelsius`, `skyCondition`, `precipitationProbabilityPercent`, `windSpeedMetersPerSecond`, and `humidityPercent` are nullable. The adapter does not derive a missing category: blank/whitespace/non-finite numeric measurements stay `null`, while measured zero and negative temperatures remain valid. Observation and ultra-short responses commonly lack precipitation probability, so it remains `null` there.
- `issuedAt` is the chosen KMA base time. Exactly one of `observedAt` and `forecastAt` is populated. `source` identifies the official 기상청 dataset, source page, and public attribution license.
- The dedicated server-only `KMA_VILLAGE_FORECAST_SERVICE_KEY` is required. `PUBLIC_DATA_PORTAL_SERVICE_KEY` is not reused because access approval is service-specific. A missing/rejected key, upstream failure, timeout, or no-data response returns `DATA_UNAVAILABLE`; KMA quota result codes return `RATE_LIMITED` with `Retry-After`.
- Raw provider results are cached by product, KMA grid coordinate, and base date/time only until the next publication gate. The in-memory cache is capped at 128 entries and concurrent identical misses share one request. Provider calls time out after five seconds.

Successful HTTP responses use a 60-second public cache header. All failures use the shared structured error body and `no-store`. The implementation uses only server modules; mock location lookup remains key-free, while weather itself honestly returns `DATA_UNAVAILABLE` until the dedicated key is configured.

The location detail weather panel reuses the solar panel's Korea-local shooting date/time and sends its offset-aware instant as `at`. With neither field selected it requests the current observation; incomplete/invalid selections disable the request. Fetching is explicit (button only), bounded to ten seconds, and canceled when the location/time changes or the panel unmounts. Previous results are hidden immediately after a selection change. The shared `locationWeatherResponseSchema` validates finite nullable measurements, timestamp/purpose consistency, attribution URLs, and the response location ID before displaying it. Provider failures offer a retry without blocking solar calculations; absent measurements are shown as “정보 없음”, never zero.

## Kakao Local place discovery adapter

`PlaceDiscoveryAdapter` is an internal server-side contract, not a browser or public HTTP API. `searchByKeyword` and `searchByCategory` both return one `PlaceDiscoveryPage` with at most 15 normalized `DiscoveredPlace` records. Requests use the shared schemas in `src/types/place-discovery.ts`: page 1–45, size 1–15, radius 0–20,000 metres, finite WGS84 coordinates, and Kakao's documented category group allow-list. Category search requires a center and radius; distance sorting requires a center.

The real adapter always calls the fixed `https://dapi.kakao.com` host, authenticates only with the server-side `KAKAO_LOCAL_REST_API_KEY`, times out after five seconds, and accepts caller cancellation. The browser-safe `NEXT_PUBLIC_KAKAO_MAP_KEY` is only for the JavaScript map SDK and is never accepted as a Local REST credential. Missing credentials, invalid input, rejected credentials (401/403), quota exhaustion (429), timeout, cancellation, malformed responses, and other upstream failures use distinct `KakaoLocalError.code` values.

Provider place IDs are de-duplicated within the returned page. Coordinates and numeric distance strings are validated before normalization. A place link is emitted only when it exactly matches the provider ID on `place.map.kakao.com`; accepted HTTP links are upgraded to canonical HTTPS and every other URL becomes `null`. Phone and address fields remain `null` when Kakao omits them. The adapter sets `cache: no-store`, does not auto-page, and has no persistence layer; consumers must not use it for bulk or permanent replication. `createFakeKakaoLocalAdapter` provides the same keyword/category contract for key-free mock and consumer tests.

## `GET /api/locations/[id]/parking`

Returns transient nearby parking candidates for the selected location. `id` must pass `locationIdSchema`. The optional integer `radius` is measured in metres, defaults to 1,000, and is bounded to 100–20,000. The server performs one Kakao category lookup with category `PK6`, distance sort, page 1, and size 15, then independently recomputes straight-line WGS84 distance, removes duplicate provider IDs and records matching reviewed static parking by normalized name or coordinates within 20m, sorts by distance then stable ID, and returns at most five candidates.

Each candidate contains a stable request-time ID, provider place ID, name, nullable address/phone/sanitized Kakao place URL, coordinates, straight-line distance, `relationship: "nearby"`, and source label. `capacity`, `openingHours`, and `priceInfo` are always `null`; the endpoint never infers live availability, prices, hours, or filming-vehicle permission. Production uses the server-only `KAKAO_LOCAL_REST_API_KEY`. Key-free mock mode returns explicitly labelled deterministic synthetic fixtures. Responses use `Cache-Control: no-store` and are never imported into the location catalogue. Missing locations return `LOCATION_NOT_FOUND`, provider quota returns `RATE_LIMITED`, and missing configuration/provider failures return `DATA_UNAVAILABLE`.

The detail client validates the full response with `nearbyParkingResponseSchema`, cancels an in-flight request when the radius changes or the component unmounts, and keeps reviewed `ParkingInfo[]` visible if dynamic lookup fails. The 1km/3km/5km controls only change the transient lookup. Candidate selection and map markers share one client state; an unavailable Kakao JavaScript SDK falls back to the key-free multi-marker preview.

## `GET /api/locations/[id]/contacts`

Returns at most one contact for each explicit type: `permit_contact`, `management_contact`, and `place_contact`. The path must be a UUID and query parameters are rejected. Each contact carries a name, validated callable phone, source and safe HTTP(S) source URL, verification timestamp, verification level, and the matching signals used. Responses are always `Cache-Control: no-store`.

The resolver checks the reviewed Busan file first. A row must match the stable location ID, normalized name, and either address or coordinates; its declared facility relationship must also agree with its contact type. Existing legacy permit columns become `permit_contact` only when the permit type is more specific than `문의 필요` and complete official provenance plus a verification date is present. Reviewed official contacts suppress provider lookup and are ordered permit, management, then place.

Kakao Local is a last-resort transient suggestion. One bounded 500m keyword request is evaluated by normalized name, address, independently measured distance, and non-commercial facility category. Only one clearly superior bounded-site match with a valid phone and canonical Kakao link may be returned, always as `place_contact` with `verification: "provider_suggestion"` and `reviewRequired: true`. It can never become a permit or management contact. Large sites, equally plausible candidates, nearby shops, blank phones, missing provider configuration, and no match return a 200 `unconfirmed` response with an explicit reason and no contact. Provider failures still use the shared structured error mapping.

The permit panel labels the three types separately. A place representative number always states that it is not a verified filming-permit number. Displaying any phone does not change `PermitInfo.type` or its reviewed state. Mock mode uses deterministic synthetic records; production provider records are neither cached nor imported into the catalogue.

Reviewed file ingestion reuses the HTTP contact schema's phone and safe source URL validators, rejecting malformed numbers and credential-bearing URLs before they reach the API/UI. Client external-info deduplication shares only active raw response bodies for the same grouping key **and URL**; each consumer independently validates its contract. A changed weather-grid representative cannot reuse another location's response, and an already-aborted consumer starts no network request. Provider results are never retained after settlement.

Address identity ignores country/city/district tokens and requires all significant expected facility tokens plus numbered evidence. The same district or road alone, and tokens combined across unrelated address/road-address fields, cannot prove a facility match. Coordinate/name/category checks remain independent; an uncertain provider number stays unconfirmed rather than becoming a permit contact.

`GET /api/locations/:id/similar` delegates ranking to `getSimilarLocations`, excludes the current/seen locations, returns at most eight results, and disables response caching. Mock mode filters stable synthetic category candidates before ranking; real mode uses the model-safe RPC below.

Supabase RPC (see `docs/search-ranking.md` for the full contract and a reproducible filter regression test):

```sql
match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 40,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null
)
-- rows: image_id uuid, location_id uuid, image_url text, similarity double precision

match_similar_location_images(
  source_location_id uuid,
  match_threshold double precision default 0,
  match_count integer default 40
)
-- rows: location_image_id uuid, location_id uuid, similarity double precision
```

`filter_region`/`filter_category` are applied inside `match_location_images` (joined against `locations`), not by the caller afterward -- this replaces an earlier version of the RPC that had no filters, which could hide a matching location if its images fell outside the raw top-`match_count` nearest neighbors. `expected_embedding_model` must match `location_images.embedding_model` exactly; a null value matches zero rows (fail closed), so every caller must pass it. `src/domains/locations/server/supabase-repository.ts`'s `searchSupabaseLocations` passes `filter_region`/`filter_category`/`expected_embedding_model` on every call (the earlier `TODO(search-filter-sql)` gap is closed); it then loads `Location` metadata only for the exact IDs the RPC returned (`getSupabaseLocationsByIds`), rather than re-running a region/category filter query -- there is nothing left to keep in sync between the two. `match_similar_location_images` has no `expected_embedding_model` parameter yet -- see the note below.

RPC responses are validated at runtime in `supabase-mappers.ts` before ranking: legacy image rows use `matchLocationImagesRowSchema`, filtered/similar hits use `parseMatchLocationImageHits`. Wrong types, non-UUID IDs or a non-array response become structured `DATA_UNAVAILABLE`, never an opaque UI exception.

## `GET /api/locations/[id]/similar`

Returns locations similar to the given location. The server computes the representative query vector itself -- the mean of all non-null CLIP image embeddings for the selected location (`match_similar_location_images`, computed in SQL) -- the client never supplies a vector for this endpoint. Response shape is `{ results: LocationSearchResult[] }`, identical to `POST /api/search`'s. The route sets `Cache-Control: no-store` and `export const dynamic = "force-dynamic"` so the detail-page CTA always gets a fresh list.

- **Path param `id`**: must be a syntactically valid uuid (`locationIdSchema`, `src/types/contracts.ts`) -- 400 `VALIDATION_ERROR` otherwise, checked independently of mock/real mode, before any repository call. Mock fixture ids are fixed UUIDs (`src/domains/locations/fixtures/locations.ts`), so this route works end-to-end in mock mode too -- e.g. `GET /api/locations/00000000-0000-4000-8000-000000000001/similar` returns 200 with mock data.
- **Nonexistent id**: 404 `LOCATION_NOT_FOUND` (checked via `getLocation` before calling `getSimilarLocations`).
- **Location exists but has no usable embedding** (no `location_images` row with a non-null embedding): `{ results: [] }` with a 200 status -- not an error, indistinguishable from "found candidates but none passed threshold".
- **Self-exclusion**: `match_similar_location_images` excludes the source location inside SQL (`location_id <> source_location_id`, applied before the `match_count` limit, avoiding the same starvation bug `filter_region`/`filter_category` fixed for `match_location_images`); `rankSimilarLocations` (`src/domains/locations/services/similar-locations.ts`, Member 1) then also drops it defensively at the application level before grouping.
- **Result limit**: up to 8, the same fixed policy as plain search (not separately configurable).
- **Ordering**: descending `similarity`; row order from the DB is not relied upon (`groupImageMatches`/`rankLocationImageHits`, Member 1's ranker, re-sorts by similarity itself).
- **Rollout limitation**: the legacy similar RPC cannot isolate mixed models. Current callers prefer the additive model-safe RPC in `20261004000002_model_safe_similar_search.sql`. Apply all pending migrations before claiming mixed-model safety on a remote deployment; the legacy fallback is only for the existing single-model catalog.

Server pages still compose repositories directly. Client browse and shortlist use `GET /api/locations`: list mode validates `locationListQuerySchema` (default 20, max 50, deterministic name/id ordering); explicit-ID mode validates up to 50 UUIDs and deduplicates them before lookup, ignoring list filters. Missing IDs are omitted, while backend failures return 503, not a fake empty catalog.

## `POST /api/search/text` (2026-10-09)

Basic rule-based natural-language search over the reviewed Busan catalog's name/aliases/description/tags. No external AI call is involved -- see "Rule-based parsing" below. This is a separate endpoint from `POST /api/search` (image search): the request/response shapes, scoring, and error contract are all independent, and nothing about image search changed to add this.

```ts
// Request
{
  query: string;                  // textSearchRequestSchema, src/types/contracts.ts
  filters?: {                     // textSearchFiltersSchema -- optional, .strict()
    district?: District;          // DISTRICT_VALUES (src/types/location-options.ts)
    category?: LocationCategory;  // LOCATION_CATEGORY_VALUES
  };
}

// Response (always 200 for a well-formed request -- see "Errors" below)
{
  results: TextSearchResult[];    // max 8, deterministic order
  parsedQuery: {
    // The district/category actually used for this search, i.e. after
    // merging the query text's own with `filters` (see "Filters" below) --
    // NOT simply what the query text named when a filter was also given.
    district: District | null;
    category: LocationCategory | null;
    keywords: string[];
    districtConflict: boolean;
  };
  unsupportedConditions: string[];
  notice: { code: "OUT_OF_SCOPE_REGION"; message: string }
        | { code: "FILTER_OVERRIDES_QUERY"; message: string }
        | null;
}

// TextSearchResult (src/types/text-search.ts)
{
  location: Location;
  score: number;                  // count of distinct matched keywords -- NOT a
                                   // cosine similarity; never compared across the
                                   // two search endpoints
  matchedOn: Array<{ field: "name" | "alias" | "description" | "tag"; keyword: string }>;
}
```

**Validation** (`textSearchRequestSchema`): `query` is `.trim().min(1).max(200)` inside a `.strict()` object (an unknown top-level field 400s, matching `searchRequestSchema`'s own strictness elsewhere in this file). Blank/whitespace-only and over-length both 400 `VALIDATION_ERROR`, with distinct Korean messages (`describeTextSearchRequestError`, `src/domains/search/server/validation.ts`, keyed off the zod issue code -- `"too_small"` vs `"too_big"` -- since both failures share the same `["query"]` field path). `filters` (`textSearchFiltersSchema`) is optional and itself `.strict()`: an unrecognized `district`/`category` value or an unknown field inside it (e.g. a client-supplied `region`) 400s `VALIDATION_ERROR` the same way `locationFilterSchema` does for `POST /api/search`. The request body is capped at `MAX_TEXT_SEARCH_REQUEST_BYTES` (2KB) the same streamed-read way `POST /api/search` enforces its own 32KB cap, duplicated rather than shared so neither route can accidentally change the other's behavior.

**Filters** (`filters.district`/`filters.category`, added 2026-10-09): the same `district`/`category` values the UI's "검색 조건" selectors already send to `POST /api/search` (image search) -- no separate `region` here, since text search is always Busan-scoped server-side regardless of input (see "Scope" below). `resolveTextSearchFilters` (`src/domains/search/server/text-search-filter-resolution.ts`) merges this with whatever district/category the query text itself named (`parseTextSearchQuery`'s output):

- Only one side names a value (or both agree): that value is used, no notice.
- Both name a value and they disagree: the **explicit filter always wins** (the caller chose it deliberately; a query-text district/category is only inferred from free text), and the response carries `notice: { code: "FILTER_OVERRIDES_QUERY", message: "..." }` naming which field(s) (지역/공간 종류) were overridden. `results` and `parsedQuery.district`/`category` reflect the filter's value, not the query text's.
- A query text that already names two conflicting districts itself (`parsedQuery.district === null`, `districtConflict: true`) has nothing to conflict with a filter -- the filter is applied with no `FILTER_OVERRIDES_QUERY` notice (`districtConflict` in the response still reports the query text's own internal conflict, independent of this).
- An out-of-scope region query (see below) short-circuits before filters are even considered -- a filter present alongside "서울 카페" does not change the empty-result/`OUT_OF_SCOPE_REGION` response.

`search_locations_by_text`'s SQL-side `filter_district`/`filter_category` parameters (unchanged by this addition -- they already existed, see "SQL" below) receive the *resolved* values, applied in SQL before `LIMIT`, same as every other filtered search RPC in this project.

**Rule-based parsing** (`parseTextSearchQuery`, `src/domains/search/server/text-query-parser.ts`): extracts `district`, `category`, and free-text `keywords` from the raw string using a curated alias dictionary (`src/domains/search/server/text-search-aliases.ts`) -- no model call, no guessing. In order: (1) a non-Busan region mention (서울, 대구, ...) short-circuits the whole request -- see "Out-of-Busan requests" below; (2) known unsupported-condition phrases (조용한, 촬영 가능, ...) are stripped and recorded in `unsupportedConditions`, never used as a keyword; (3) district aliases are matched and stripped (longest alias first, so e.g. "해운대구" is consumed whole before the shorter "해운대" would otherwise leave a stray "구"); naming two different districts sets `districtConflict: true` and `district: null` rather than guessing one; (4) category aliases (literal labels plus a small curated synonym list) are matched the same way; (5) whatever text remains is split into `keywords`, with Korean particle stopwords (은/는/이/가/...) dropped.

**Optional NVIDIA intent enrichment (P1, added 2026-10-09, default OFF):** `enrichWithNvidiaIntent` (`src/domains/search/server/nvidia-intent-adapter.ts`) can layer an LLM-structured intent on top of the rule-based parse above -- strictly scoped to *intent structuring* only: NVIDIA never performs the actual search (still `searchByText`/`search_locations_by_text` below, unchanged) and NVIDIA's text vectors are never compared against CLIP's image vectors (the two search endpoints remain otherwise fully independent).

- **Disabled by default.** Requires both `NVIDIA_INTENT_ENABLED=true` and a configured `NVIDIA_API_KEY` (`src/env/server-schema.ts`); either missing means zero network calls are ever attempted (verified by test, not just by configuration -- see `src/infrastructure/nvidia/intent-client-factory.test.ts` and the route-level test in `route.test.ts`). `NVIDIA_API_KEY` is read in exactly one place (`src/env/server.ts`, `server-only`-guarded); a `NEXT_PUBLIC_*NVIDIA*KEY*` variant throws immediately at startup (`assertNoPublicNvidiaKey`), and the bare name `NVIDIA_API_KEY` is in the client-bundle secret-leak scan's forbidden-names list (`scripts/security/client-bundle-secrets.ts`).
- **Never called for an out-of-scope query** -- the route checks `parsedQuery.outOfScope` first and returns the fixed `OUT_OF_SCOPE_REGION` response before NVIDIA is ever considered, same as without this feature.
- **Response contract**: NVIDIA's structured output is restricted to exactly `{ district, category, keywords, unsupportedConditions }` (`nvidiaIntentResponseSchema`, `src/infrastructure/nvidia/intent-contract.ts`); `district`/`category` validate against the same single `DISTRICT_VALUES`/`LOCATION_CATEGORY_VALUES` definitions as everywhere else in this file. Any other top-level field is silently dropped (plain, non-`.strict()` Zod object); any other validation failure (disallowed enum value, wrong type, non-JSON, missing message content) discards the *entire* NVIDIA response and falls back to the rule-based parse for that request -- never a partial/half-trusted merge.
- **Merge semantics** (`applyNvidiaIntentOverride`, `src/domains/search/server/nvidia-intent-merge.ts`): enrichment is additive despite the historical function name. The base parser's district/category win; NVIDIA only fills an unset value. A base district conflict remains unresolved and cannot be cleared by NVIDIA. Keywords and unsupported conditions are deduplicated unions; `outOfScope` is never changed. Explicit UI filters are resolved afterward and retain precedence.
- **Reliability controls**: a fixed model allowlist (`NVIDIA_INTENT_ALLOWED_MODELS`, `src/infrastructure/nvidia/intent-models.ts`; `NVIDIA_INTENT_MODEL` validates against it at startup), a per-attempt timeout covering both response headers and body, limited retries with exponential backoff on 429/5xx/timeout only (never on a non-429 4xx, never on malformed/schema-invalid output), and a per-minute + per-day in-process call budget (`NvidiaCallBudget`, `src/infrastructure/nvidia/intent-budget.ts`). The adapter passes a request-scoped reservation callback to the client, which charges **every actual attempt, including retries**, immediately before fetch. Exhaustion stops further calls and falls back to the base parse; failed calls are not refunded. This budget is per instance: cold starts reset it and parallel serverless instances do not share it, so it is **not an account-wide spending cap**. Keep the feature off until provider-side quota controls and live evaluation are confirmed. Direct opt-in offline evaluation does not use the application's shared budget. Defaults remain documented in source.
- **Failure handling**: every failure mode returns the base rule-based parse unchanged. New responses include `intentSource: "nvidia" | "rules"` (optional in TypeScript for older saved sessions). An enabled but unavailable/failed provider returns HTTP 200 with `intentSource: "rules"` and an `INTENT_UNAVAILABLE` notice explaining basic-search fallback; an intentional disabled mode does not show that notice. Filter override information is preserved in the fallback notice. A 200 alone is not proof of NVIDIA success.
- **Prompt/injection boundary**: the raw query is sent as a JSON string *value* (`{"user_query": "..."}`), never interpolated into the system prompt, so injected text (e.g. "이전 지시 무시하고 ...") has no syntactic power to alter the instructions -- combined with strict schema validation above as the actual safety boundary regardless of what the model does with it.
- **Logging**: no API keys, raw queries, provider bodies or reasoning traces. Success records a model identifier and keyword count; failure records a safe error code and upstream HTTP status where available.
- **Hosted Nemotron configuration**: only `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` is allowlisted/default. Hosted endpoint remains `https://integrate.api.nvidia.com/v1/chat/completions`; `stream:false`, `max_tokens:1024`, `reasoning_budget:0`, `chat_template_kwargs.enable_thinking:false`. Two attempts at most, 8s each plus 1s backoff (17s provider ceiling). The Korean metadata prompt requests Korean keyword roots and derives district labels from shared options. Observed hosted responses may prefix final JSON with `</think>`; only that exact leading sentinel and a complete JSON markdown fence are accepted. Empty/truncated/invalid content and reasoning traces are rejected, never searched.
- **Evaluation tool** (`pnpm nvidia:evaluate-intent`): offline mode runs the actual rule parser without API calls. Opt-in live mode reuses the production client/prompt/Zod/merge, not duplicated parser or payload implementations. To load ignored local credentials without printing them: `node --env-file=.env.local --experimental-strip-types scripts/nvidia/evaluate-intent.ts --live`. Curated fixtures include the five Korean release queries. Reports show HTTP status, latency and validated intents; any upstream failure exits nonzero. This evaluates intent, not retrieval quality: separately verify `/api/search/text` against real DB IDs, result counts and browser cards.

**Scope**: enforced the same way as image search (`BUSAN_REGION`, `src/domains/locations/server/supabase-repository.ts`) -- `filter_region` is always `'부산'`, never client input, for both the SQL and mock backends.

**Out-of-Busan requests**: a non-Busan region mention (e.g. "서울 카페") returns `{ results: [], parsedQuery: { district: null, category: null, keywords: [], districtConflict: false }, unsupportedConditions: [], notice: { code: "OUT_OF_SCOPE_REGION", message: "..." } }` with HTTP 200, not an error -- the request was well-formed, it's just outside the catalog's current scope. A query naming both a non-Busan region and a Busan district (e.g. "서울에서 해운대 느낌 나는 곳") is also treated as out-of-scope, rather than guessing which half of the query to honor.

**Unsupported conditions**: a phrase describing something the catalog has no verified data for (조용함, 촬영 가능, ...) is reported in `unsupportedConditions` but never used to filter, score, or otherwise imply that a returned result satisfies it -- a result appearing in the response never means "confirmed quiet," only "matched on the other given keywords/filters."

**SQL**: `search_locations_by_text(keywords text[], filter_region text, filter_district text, filter_category text, match_count integer)` (see `supabase/migrations/20261009000000_text_search.sql` and `docs/search-ranking.md`). `keywords` and the filters are plain bound RPC parameters -- never string-concatenated into SQL -- and the RPC's own `escape_ilike_pattern()` helper escapes `%`, `_`, and `\` before building each ILIKE pattern, so a keyword containing those characters matches literally instead of acting as a wildcard. `filter_region`/`filter_district`/`filter_category` follow the same null-means-unrestricted convention as `match_location_images_filtered`. An empty `keywords` array matches every row in scope (filters alone decide eligibility) rather than zero rows. `security invoker` + fixed `search_path`, same as every other RPC in this project; the existing public-read RLS `select` policy on `locations` already covers the new `aliases`/`tags` columns with no separate policy needed.

**Ranking**: deterministic score-descending-then-`location_id`-ascending (`rankTextSearchHits`, `src/domains/locations/services/text-search-ranking.ts`), re-applied in application code rather than trusted from the RPC's row order -- the same defensive stance `groupImageMatches`/`rankSimilarLocations` already take for image search. `matchedOn` is re-derived in application code (case-insensitive substring check against the already-hydrated location's own fields) rather than returned by the RPC, since it only needs to run over the final ≤8 results.

Case-insensitively identical repeated keyword tokens are removed before retrieval, preserving first
occurrence order; repeating a word does not increase its weight. Mock scoring and
match-reason display defensively deduplicate too, and blank keywords never imply
a match. The first trimmed spelling is retained across rule parsing, NVIDIA
keyword merging and scoring/reasons. This does not add general stemming or inferred metadata.
The explicit Korean sightline construction `명사+이/가 보이는` is separately
normalized to its literal noun, even if that noun is also a category alias (e.g.
바다). The original phrase remains an unsupported condition: a metadata hit
never proves actual visibility. Arbitrary trailing particles in names are not
stripped, and out-of-Busan rejection still runs before normalization. Catalog read failures
offer an explicit same-filter/same-offset retry; they are not silently replaced
with empty results or retried indefinitely.

**Alias dictionary**: `src/domains/search/server/text-search-aliases.ts` is the single place to add a district/category alias, an unsupported-condition phrase, or a keyword stopword -- see that file's own header comment for exactly how. District aliases include every district's full label and "-구"/"-군"-stripped short form (auto-generated from `DISTRICT_LABELS`, never hand-duplicated), plus a small hand-curated list of well-known neighborhood/landmark names (e.g. "광안리" -> `busan_suyeong_gu`) that don't literally match a district label. A short-form alias is never registered below 2 characters -- 중구/서구/동구/남구/북구 match only by their full label, since their stripped forms (중/서/동/남/북) are common enough to false-positive-match almost any unrelated text (caught by exercising the route manually, not by a unit test).

**Mock mode**: `searchMockLocationsByText` (`src/domains/locations/server/mock-repository.ts`) mirrors the same filter -> score -> `rankTextSearchHits` division of labor as the Supabase path, against fixture `aliases`/`tags` added for this feature (`src/domains/locations/fixtures/locations.ts`).

## Release audit contract updates (2026-10-04)

- The historical RPC descriptions above document the legacy rollout path. Current search calls `match_location_images_filtered` with model key `CLIP_MODEL_KEY` from `src/lib/ai/embedding-config.ts`; the pre-model five-argument filtered signature is retried only for its exact PGRST202 missing-signature error. This preserves region/category filtering on the existing production schema, but does not establish model isolation until migrations are applied.
- Similar search calls `match_similar_locations_filtered(source_location_id, match_threshold, match_count, expected_embedding_model, excluded_location_ids, filter_region, filter_district)` (the last two params added 2026-10-08, see below). It averages only compatible embeddings, excludes current/seen IDs before grouping and LIMIT, and validates RPC rows at runtime. Legacy `match_similar_location_images` remains a temporary fallback; application exclusion is defensive but its raw image limit cannot guarantee full coverage, and that legacy path cannot enforce Busan scope either (no `locations` join at all).
- The similar CTA remembers seen IDs, requests new candidates, and preserves the last list when exhausted. Its response shape remains unchanged. Search results remain fixed Top 8; browse pagination is independent.
- Search consumes nested structured errors (and tolerates the former flat shape). The 32KB request cap is enforced during streamed reading, cancelling oversized input before buffering its remainder.
- Offline vector imports and image metadata insertion supply the same centralized `embedding_model` key. Solar controls represent Korean shooting time explicitly (`Asia/Seoul`, UTC+09:00), independent of the browser/device timezone, and reject invalid calendar dates.

## Busan district contract (2026-10-08)

### Client search-state consistency (2026-10-13)

District/category filters are shared by image and text search. Changing or resetting
either filter invalidates both result snapshots, including the hidden mode's results,
but preserves the selected image, cached embedding and text input. A mode switch
without a filter change still restores each mode's own results. A new unfiltered
home text query clears any previous filtered image results before handing off to
`/search`. Filter controls remain disabled until client handlers are ready, so early
SSR selections cannot appear accepted and then disappear during hydration.
The same readiness guard applies to both home/workspace search-mode buttons:
they cannot accept a click until React has attached the switching handlers.

Kakao Local coordinates must be nonempty finite decimal strings within WGS84 bounds;
missing coordinates are errors, never inferred zero. Cancellation or timeout during
response-body reading retains its respective provider error code, rather than being
reported as malformed JSON. Invalid JSON remains `MALFORMED_RESPONSE` and raw parser
details are not retained in the loggable error.

The catalog's region dimension is being narrowed from all 17 first-level regions to Busan's 16 구/군 (see `docs/database.md`'s migration 17 entry and `docs/search-ranking.md`). This is a transition-period contract, not a finished data migration:

- `Region`/`REGION_VALUES` (`src/types/location-options.ts`) now contain only `"부산"`. `LocationFilter.region` still validates (accepts only `"부산"`) so an old stored client session/URL doesn't 400, but the application never trusts it: every read (`getLocations`, `getLocation`, `POST /api/search`, `GET /api/locations/[id]/similar`) enforces Busan scope unconditionally and server-side (`BUSAN_REGION` in `src/domains/locations/server/supabase-repository.ts`), not from `filters.region`. A non-Busan id behaves exactly like a missing one through `getLocation` (`null` → 404 via `GET /api/locations/[id]/similar`'s `LOCATION_NOT_FOUND`, or Next's `notFound()` on the detail page) -- there is no separate "wrong region" error code.
- `LocationFilter.district` is the real filter now: one of `DISTRICT_VALUES` (`src/types/location-options.ts`) or omitted (unrestricted). A location's own `district` can be `null` ("구/군 unconfirmed from its source address", never guessed) -- a null-district location appears in an unfiltered ("부산 전체") result but never in a specific-district-filtered one, the SQL-level consequence of the same null-means-unrestricted convention `filter_region`/`filter_category` already use (there is no separate app-side rule to keep in sync).
- `match_location_images_filtered` gained `filter_district` (7th param) and `match_similar_locations_filtered` gained `filter_region`/`filter_district` (6th/7th params) -- see `docs/database.md`/`docs/search-ranking.md` for the full signatures. Both changes are additive (new trailing optional params via the project's established drop-then-recreate convention), applied in SQL before the per-location `distinct on`/`LIMIT`, never as a post-hoc application filter.
- `region`/`district` are planned for eventual removal of the deprecated `region` side once every consumer reads `district` instead and the live catalog's non-Busan rows are retired (a separate data-pipeline task, not scheduled here) -- `locations.region`'s own check constraint still allows all 17 original regions in the meantime, so this is an application-layer scope restriction, not yet a storage-layer one.
- Out of scope for this change: backfilling `district` for the real catalog's existing Busan rows (they all start `null`), and narrowing/cleaning up the non-Busan rows already in the shared catalog table. `scripts/data/**`'s own nationwide discovery/import pipeline is intentionally decoupled from this narrowed `Region` -- see `KoreaRegion`/`KOREA_REGION_VALUES` in `scripts/data/contracts.ts`.
