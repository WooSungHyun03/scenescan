# Location search ranking

SceneScan retrieves image-level cosine matches from pgvector and converts them into unique location results in application code. The pure implementation lives in `src/lib/ai/location-ranking.ts`; the server service only joins ranked IDs to `Location` metadata.

## Production policy

- Candidate threshold: cosine similarity `>= 0`, enforced by the RPC and defensively by the ranker.
- Aggregation: maximum image similarity per location.
- Result limit: eight locations.
- Matched image: the strongest image for that location.
- Location tie-break: ascending `location_id`.
- Image tie-break within a location: ascending `location_image_id`.

Before aggregation, the ranker discards blank IDs, non-finite scores, scores outside cosine range `[-1, 1]`, and locations absent from the filtered metadata set. Repeated hits for the same image are collapsed to their strongest score. Locations are therefore unique even if pgvector returns several matching images for one location. Empty candidates or filters that remove every candidate return an empty list.

Max aggregation remains the default because a reference frame may strongly correspond to one defining view, while locations can have unequal image counts. It also preserves the existing API behavior. This is a product assumption rather than a retrieval-quality conclusion; DAY 7 evaluation must test it against an authorized dataset.

## Top-k mean alternative

The pure ranker also supports `top-k-mean`. It sorts and deduplicates a location's image hits, averages up to its strongest `k`, and keeps the strongest image ID for display. For example, synthetic scores `A=[1.0, 0.1]` and `B=[0.8, 0.7]` rank A first with max, but B first with top-2 mean (`0.75` versus `0.55`). This demonstrates the strategies' behavior; it is not evidence that either strategy retrieves real filming locations better.

Top-k mean is deliberately not wired as the service default until retrieval evaluation measures Top-1/3/5 or Recall@K and documents dataset balance. Changing the default requires updating this document, the API contract, and regression expectations together.

## Candidate cap

The RPC returns at most 200 image hits before application-side region/category filtering and location grouping. The ranker is deterministic for the candidates it receives, but a larger production dataset may require SQL-side filters or a measured candidate-limit change so eligible locations are not hidden beyond that boundary.
