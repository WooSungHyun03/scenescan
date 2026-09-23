# Four-person ownership

| Member | Primary paths | Deliverables |
| --- | --- | --- |
| 1 AI / Deployment | `src/lib/ai/**`, `scripts/embeddings/**`, deployment setup | Browser CLIP, worker performance, embedding import workflow, vector relevance, Vercel release |
| 2 Frontend / UX | `src/app/**` except `api`, `src/domains/*/components/**`, `src/shared/ui/**` | Upload UX, responsive search/results/detail, accessible loading/error states, map/date controls |
| 3 Backend / Application | `src/domains/*/server/**`, `src/app/api/**`, `src/infrastructure/supabase/**`, migrations | Queries, validation, filtering, read contracts, Supabase RPC integration |
| 4 Data / Geo | geo/map/solar/production services in `src/domains/locations/services/**`, `scripts/data/**` | Normalization, Kakao adapter, coordinates, solar and parking/permit metadata |

`src/types/**`, `src/shared/**`, domain composition files, root config, and shared docs are coordinated files. Agree on contract changes first; small PRs touching a shared file should notify the other owners. Domain folders express business ownership rather than creating one top-level module per small feature: location UI belongs to Member 2, location server repositories to Member 3, and geo/map/solar/production services to Member 4.

Suggested first parallel tasks: Member 1 verify real browser inference on target devices; Member 2 refine upload/results/detail UX; Member 3 seed authorized sample data and test real RPC; Member 4 validate geo/solar behavior and data provenance. Each member should keep mock mode usable.
