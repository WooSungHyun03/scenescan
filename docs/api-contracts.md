# Shared contracts

The source of truth for TypeScript shapes is `src/types/domain.ts` and `src/types/contracts.ts`. Change these and this document together.

| Operation | Input | Output | Owner |
| --- | --- | --- | --- |
| `ImageEmbeddingService.embed` | `File \| Blob` | `Promise<number[]>`, length 512 | Member 1 |
| `searchByImage` / `POST /api/search` | `{ embedding: number[512], filters: LocationFilter }` | `{ results: LocationSearchResult[] }`, maximum 8 | Member 3 with 1 |
| `getLocations` | `LocationFilter` | `Location[]` | Member 3 |
| `getLocation` | string ID | `LocationDetail \| null` | Member 3 |
| `getSimilarLocations` | string ID | `LocationSearchResult[]` | Member 1 with 3 |
| `getSolarPosition` | `GeoPoint`, JavaScript `Date` | `SolarPosition` (degrees) | Member 4 |

`LocationFilter`: optional `region` (`서울`, `부산`, `인천`, `경기`) and `category` (`urban`, `nature`, `industrial`, `interior`). Search request validation uses Zod and rejects non-finite numbers or arrays with a length other than 512. `POST /api/search` returns 400 for invalid JSON/body and 503 for unavailable data access. `similarity` is cosine similarity in real mode and a synthetic UI value in mock mode. Images are grouped by location using the highest image score; a top-k mean option can be added as a small pure function later.

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
