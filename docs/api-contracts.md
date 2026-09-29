# Shared contracts

The source of truth for TypeScript shapes is `src/types/domain.ts` and `src/types/contracts.ts`. Change these and this document together.

| Operation | Input | Output | Owner |
| --- | --- | --- | --- |
| `ImageEmbeddingService.embed` | `File \| Blob`, optional `{ signal, timeoutMs }` | `Promise<number[]>`, finite length 512 | Member 1 |
| `searchByImage` / `POST /api/search` | `{ embedding: number[512], filters: LocationFilter }` | `{ results: LocationSearchResult[] }`, maximum 8 | Member 3 with 1 |
| `getLocations` | `LocationFilter` | `Location[]` | Member 3 |
| `getLocation` | string ID | `LocationDetail \| null` | Member 3 |
| `getSimilarLocations` / `GET /api/locations/:id/similar` | selected location ID | `{ results: LocationSearchResult[] }`, selected location excluded, maximum 8 | Member 1 with 3 |
| `getSolarPosition` | `GeoPoint`, JavaScript `Date` | `SolarPosition` (degrees) | Member 4 |
| `classifyLighting` | `SolarPosition`, camera heading in degrees | `LightingClassification \| null` | Member 4 |
| `sortParkingByDistance` | `GeoPoint`, `ParkingInfo[]` | `ParkingDistanceResult[]` | Member 4 |

`LocationFilter`: optional `region` (all 17 Korean first-level regions: `서울`, `부산`, `대구`, `인천`, `광주`, `대전`, `울산`, `세종`, `경기`, `강원`, `충북`, `충남`, `전북`, `전남`, `경북`, `경남`, `제주`) and `category` (`urban`, `nature`, `industrial`, `interior`). Search request validation uses Zod and rejects non-finite values, arrays with a length other than 512, and all-zero vectors for which cosine similarity is undefined. `POST /api/search` returns 400 for invalid JSON/body and 503 for unavailable data access. `similarity` is cosine similarity in real mode and a synthetic UI value in mock mode. Images are grouped by location using the highest image score, then sorted by descending similarity and ascending location ID for deterministic ties. Duplicate images, malformed scores, and locations missing from the filtered metadata set are excluded. A pure top-k mean strategy exists for evaluation, but max remains the service default.

`ImageEmbeddingService` also exposes `getStatus()` and `subscribe(listener)`. Status is one of `idle`, `loading`, `ready`, or `error`; loading status can include progress from 0 to 100. Both mock and real modes accept JPEG, PNG, and WebP inputs with the limits documented in `docs/architecture.md`. The default inference timeout is 120 seconds.

`classifyLighting` returns `back-light` when the camera points within 45 degrees of the sun, `front-light` when the sun is within 45 degrees of directly behind the camera, and `side-light` for the angles between them. It returns `null` when the sun is below the horizon or either heading is not finite. The UI translates these values to 순광, 측광, and 역광 without duplicating the angular thresholds.

`sortParkingByDistance` calculates straight-line distance from the location point, sorts nearest first without mutating the input, and returns `null` distance for invalid coordinates. A non-null `ParkingInfo.locationId` matching the current location identifies location-linked parking; null or a different ID is shown as nearby parking. The contract does not infer whether nearby parking is public or private when the source data does not provide that distinction.

`GET /api/locations/:id/similar` delegates ranking to `getSimilarLocations`, excludes the current location defensively, returns at most eight results, and disables response caching so the detail-page CTA can request a refreshed list. Mock mode returns stable synthetic category matches; real mode uses the Member 1/3 repository implementation described below.

Supabase RPC:

```sql
match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision,
  match_count integer
)
-- rows: location_image_id uuid, location_id uuid, similarity double precision
```

API pages currently call repositories directly on the server for read-only listing/detail. Add a route only when a client needs an HTTP contract.

Similar-location search uses the mean of all non-null CLIP image embeddings for the selected location as its representative query. The database excludes the selected `location_id`; application ranking then removes duplicate images/locations, drops orphan or malformed rows, uses max image similarity, and applies deterministic location/image ID tie-breaking. Unknown locations and locations without embeddings return an empty list. Reference-image blending remains disabled until retrieval evaluation demonstrates an improvement.
