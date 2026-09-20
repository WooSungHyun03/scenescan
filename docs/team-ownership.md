# Four-person ownership

| Member | Primary paths | Deliverables |
| --- | --- | --- |
| 1 AI / Deployment | `src/lib/ai/**`, `scripts/embeddings/**`, deployment setup | Browser CLIP, worker performance, embedding import workflow, vector relevance, Vercel release |
| 2 Frontend / UX | `src/app/**` except `api`, `src/components/**`, `src/features/*/components/**` | Upload UX, responsive search/results/detail, accessible loading/error states, map/date controls |
| 3 Backend / Application | `src/server/**`, `src/app/api/**`, `src/lib/supabase/**`, migrations | Queries, validation, filtering, read contracts, Supabase RPC integration |
| 4 Data / Geo | `src/lib/geo/**`, `src/lib/maps/**`, `scripts/data/**`, solar and production feature logic | Normalization, Kakao adapter, coordinates, solar and parking/permit metadata |

`src/types/**`, `src/mocks/**`, root config, and shared docs are coordinated files. Agree on contract changes first; small PRs touching a shared file should notify the other owners. UI component subfolders under solar and production-info belong to Member 2. The map adapter belongs to Member 4 while the map component belongs to Member 2.

Suggested first parallel tasks: Member 1 verify real browser inference on target devices; Member 2 refine upload/results/detail UX; Member 3 seed authorized sample data and test real RPC; Member 4 validate geo/solar behavior and data provenance. Each member should keep mock mode usable.
