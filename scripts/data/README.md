# Data imports

Member 4 owns data normalization and external dataset adapters here. Do not add third-party location records or images until reuse and redistribution rights are confirmed. `src/domains/locations/fixtures/locations.ts` contains invented development fixtures.

## Canonical location normalization

Keep provider files unchanged under a raw-data directory and write generated files to a separate normalized-data directory. The normalizer also refuses to use the raw or mapping path as its output path.

```text
data-work/
  raw/provider.json
  mappings/provider.json
  normalized/provider.json
```

Copy `scripts/data/mapping.example.json` and map the provider's field names to SceneScan fields. Dot-separated paths address nested objects. `recordsPath` selects an array inside a top-level object; omit it when the raw document itself is an array. Category and region maps translate provider values to the existing `LocationCategory` and `Region` unions.

```bash
pnpm data:normalize \
  data-work/raw/provider.json \
  data-work/mappings/provider.json \
  data-work/normalized/provider.json
```

Normalized output schema version 2 contains `name`, `description`, `category`, `region`, `address`, flattened `latitude` and `longitude`, `permit`, `parking`, `noiseSources`, `images`, `sourceUrl`, and structured `provenance`. Shared field types are derived from `src/types/domain.ts`. Map `fields.id` to a controlled location UUID and `images.localPath` to each licensed local image when preparing data for validation and import. Both fields remain optional during initial normalization so a provider extract can be reviewed before database IDs and local assets are assigned.

### Category mapping and review queue

`category-mapping.ts` is the single category conversion point. It accepts only exact values from its explicit common table or the current source's `categoryMap`. Matching trims whitespace, applies Unicode NFKC normalization, and ignores Latin letter case. It does not use substrings, fuzzy matching, or keyword inference.

The conservative common table contains the four canonical values and their direct Korean labels:

| Source value | SceneScan category |
| --- | --- |
| `urban`, `도시` | `urban` |
| `nature`, `자연` | `nature` |
| `industrial`, `산업` | `industrial` |
| `interior`, `실내` | `interior` |

Provider terms such as `city`, `park`, `factory`, and `studio` must be declared in that provider's mapping file. The source-specific table takes precedence, so a provider's documented semantics can override a common label when necessary.

Unknown, missing, and invalid category values are not assigned a category. Their records are omitted from `locations` and added to `reviewQueue` with the raw record index, available source ID and name, original category text, normalized lookup key, and reason. The raw dataset remains the source of truth, so the queue stores references instead of copying the full raw record.

```json
{
  "locations": [],
  "reviewQueue": [
    {
      "recordIndex": 7,
      "sourceRecordId": "provider-107",
      "name": "Mixed-use complex",
      "sourceCategory": "mixed-use",
      "normalizedSourceCategory": "mixed-use",
      "reason": "UNKNOWN_CATEGORY"
    }
  ]
}
```

Review the provider documentation, add an explicit entry to that source's `categoryMap`, and run normalization again. Normalization still writes this reviewable output when the queue is non-empty, but exits with status 1. Validation also reports `CATEGORY_REVIEW_REQUIRED`, preventing the dataset from passing an import gate until the queue is empty.

### Permit information safety

SceneScan stores inquiry guidance, not a legal or administrative permission decision. Canonical `permit.type` values are limited to:

- `문의 필요`
- `정보 확인 필요`
- `영상위원회 문의`
- `기관 직접 문의`

Do not store provider booleans such as `can_film: true`, or decision text such as `허가 가능` and `허가 불가능`, as permit guidance. If a provider supplies its own status code or phrase, review the provider documentation and add an explicit `permitTypeMap` entry:

```json
{
  "permitTypeMap": {
    "contact_first": "문의 필요",
    "film_commission": "영상위원회 문의",
    "agency_contact": "기관 직접 문의"
  }
}
```

Missing or blank source status uses the safe `defaults.permitType`, which defaults to `문의 필요`. A present but unknown status fails normalization instead of being guessed.

`contactName` and `contactPhone` are read only from the paths explicitly configured under `permit`. When a source does not provide those paths or values, normalization stores `null`. It does not derive contacts from the location name, permit guidance, address, or similarly named unmapped fields. Permit provenance records the source used for the stored guidance.

The production Commons manifest may add a reviewed `permit` object to a location. The collector copies that object into canonical `permit.provenance`; locations without it retain the conservative `문의 필요` fallback. Add only information manually checked on an official operating organization, municipality, public reservation service, or heritage-management page. When a page exposes only a representative switchboard, say that explicitly in `note`. Record the source content date in `reference_date` when known and the actual manual check time in `last_verified_at`. The current priority set and source limitations are recorded in `data/production/PERMIT_SOURCES.md`.

### Data provenance

Every normalized location, permit object, and parking entry contains frontend-readable provenance:

```json
{
  "source": "City parking API",
  "sourceUrl": "https://example.com/parking/1",
  "referenceDate": "2026-09-02",
  "lastVerifiedAt": "2026-09-22T10:00:00Z"
}
```

- `source` and HTTP(S) `sourceUrl` are always required.
- `referenceDate` is a real ISO calendar date (`YYYY-MM-DD`) or `null`.
- `lastVerifiedAt` is an ISO 8601 timestamp with a timezone or `null`.
- The normalizer never inserts the current time. Missing dates remain `null` so generated output stays deterministic and does not claim a verification that did not occur.

Dataset-level values under `source` provide the fallback provenance. `provenance.location` can map record-specific location fields. `provenance.permit` and `parking.provenance` can then override their own source, URL, dates, or verification timestamp. Unspecified permit and parking provenance fields inherit the location provenance, which keeps every output entry traceable while preserving more specific source metadata whenever the provider supplies it.

The legacy location `sourceUrl` remains in the normalized record for the current import contract and matches `provenance.sourceUrl`. Parking data is optional; when configured, each source parking object is normalized to `name`, flattened coordinates, capacity, opening hours, price information, and its own provenance object.

Validation rejects unknown mapping fields, unsafe object paths, missing required text, unmapped region values, unsafe permit guidance, malformed provenance dates, non-finite or out-of-range coordinates, non-HTTP(S) image/source URLs, and missing provenance. Unmapped categories enter the review queue described above. Numeric coordinate strings and numeric category/region codes are accepted because they are common in JSON converted from CSV. Missing descriptions use the configured default. Missing permit contacts receive explicit nulls and missing permit guidance uses the configurable `문의 필요` default; no permission decision is inferred.

This command only reads local JSON and writes reviewed JSON. It does not download images, call a provider API, or write to Supabase. A source URL records provenance but does not establish redistribution rights; document the license and attribution in `DATA_LICENSES.md` before committing real records or images.

## Curated production seed

`data/production/commons-manifest.json` is the reviewed source manifest for the production dataset. It contains 200 Korean filming-location candidates and 261 explicitly licensed Wikimedia Commons images across all 17 first-level regions. Ten seed locations retain six views each, five new places have three views, one has two, and 184 have one. The 2026-10-02 review added 41 places and 52 photos, prioritizing nature/harbor coverage rather than automatically accepting more stations and schools. A source location is not a filming permit, and broad-feature coordinates are not verified entrance points.

### Region and category coverage gate

The initial balancing target is **at least three locations in every one of the 68 region × category cells** (17 regions × `urban`/`nature`/`industrial`/`interior`). This is a minimum filter-coverage target, not a claim that three records make a statistically representative dataset. Raising the target requires a reviewed storage, embedding, and Supabase capacity plan.

Generate the deterministic coverage report before discovery:

```bash
node --experimental-strip-types scripts/data/report-coverage.ts \
  data/production/commons-manifest.json \
  --output data/production/coverage-report.json \
  --target 3
```

The report records category and region totals, every cell count, empty and under-target cells, and the number of reviewed locations still required. Discovery fetches Commons metadata only for candidates related to cells below the target. It chooses the least-covered cells first and stops adding to a cell once the target is met, so a large `--max` value cannot continue increasing an already dominant category. The review queue includes the affected cells' current count and deficit and is ordered with empty cells first.

Wikidata discovery uses only the official Wikidata Query Service and Wikimedia Commons API. Commons metadata must pass the existing CC0/Public Domain/CC BY/CC BY-SA allowlist and additional-restriction gate before a candidate can be selected. Do not scrape FilmKorea, search-result pages, tourism sites, or any source whose reuse rights are not explicit.

Candidates mapped to more than one SceneScan category are never resolved by category priority. A Wikidata item discovered under more than one first-level region is also held because a single point may not identify the correct side of a river, mountain, island, or other cross-boundary feature. Temples, parks, caves, campuses, and broad natural features such as mountains, rivers, islands, wetlands, tidal flats, forests, coasts, lakes, waterfalls, and trails require manual review even when Wikidata yields one category. These candidates are written to the discovery report's `review_queue` with their QID, Wikidata types, candidate regions/categories, coordinate, region-specific addresses, and official source URL. Copy `scripts/data/wikidata-review-decisions.example.json`, record an attributable accept/reject decision, and rerun discovery with `--review-decisions`. An accepted category and region must be supported by the candidate's Wikidata results; the selected region's address is preserved in the final candidate.

```bash
pnpm data:discover-wikidata \
  data-work/wikidata/commons-manifest.json \
  --base data/production/commons-manifest.json \
  --target 3 \
  --max 400 \
  --review-decisions data-work/wikidata/review-decisions.json \
  --verified-at 2026-10-01T09:00:00+09:00
```

Discovery blocks coordinates outside broad South Korea bounds, addresses that do not match the requested first-level region, unsuitable school/hospital/prison/post-office/research-institute records, names or coordinates within 120 metres of an existing place, duplicate Commons files, and images rejected by the Commons license gate. The manifest remains a candidate artifact until a reviewer checks the report and representative cases.

Discover additional candidates from Wikidata's CC0 location metadata before collection. Discovery requires an address, coordinate, representative image, supported place type, matching first-level region, and an image accepted by the Commons license gate. It excludes schools, hospitals, non-place artifacts, malformed addresses, near-duplicate coordinates, and duplicate source images.

```bash
pnpm data:discover-wikidata \
  data-work/wikidata/commons-manifest.json \
  --base data/production/commons-manifest.json \
  --max 400
```

Review the generated manifest and report, then promote it to `data/production/commons-manifest.json`. Rebuild local working images and derived manifests with:

```bash
pnpm data:collect-commons
pnpm data:validate data/production/locations.json data/production/validation-report.json --require-local-assets --image-root . --embedding-manifest data/production/embeddings-manifest.json --image-licenses data/production/image-licenses.json
pnpm data:upload-storage data/production/locations.json data/production/embeddings-manifest.json data/production --dry-run
pnpm data:upload-storage data/production/locations.json data/production/embeddings-manifest.json data/production --apply
pnpm embeddings:prepare data/production/embeddings-manifest.json data/production/embeddings.json --batch-size 8 --retries 2
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --validate-only
pnpm data:check-attribution-links data/production/locations.json data/production/embeddings-manifest.json \
  --output data-work/reports/attribution-links.json
pnpm embeddings:import data/production/embeddings.json --validate-only
```

The collector re-fetches Commons metadata and fails closed when a file is missing, is not JPEG, has neither an approved Creative Commons license nor a verified public-domain declaration, declares extra restrictions, exceeds 15 MB, or does not have a complete JPEG signature. Downloads run four at a time with bounded retry. It writes files atomically and produces:

- `public/locations/*.jpg`: local 1024-pixel working images used for review and embedding generation;
- `data/production/locations.json`: canonical location records;
- `data/production/image-licenses.json`: source and local checksums plus exact attribution;
- `data/production/IMAGE_LICENSES.md`: complete human-readable attribution table;
- `data/production/embeddings-manifest.json`: offline CLIP input.

Running the collector is deterministic for a fixed Commons source revision except for a provider-side regenerated thumbnail. Review any checksum change before committing it. The discovery step produces candidates, not an authority to bypass the license and validation gates. `public/locations/*.jpg` is intentionally not committed because production serves the reviewed Storage copies. Do not reconstruct it with arbitrary URLs, search results, or a blanket downloader. The only approved restoration path is the reviewed `commons-manifest.json` + `image-licenses.json` workflow through `pnpm data:collect-commons`; review any provider revision or checksum change before continuing. The collector and both `--validate-only` commands do not write to Supabase.

### Reviewed static parking

Static parking uses the official [전국주차장정보표준데이터](https://www.data.go.kr/data/15012896/standard.do). It contains municipality-managed public/private parking coordinates, capacity, hours, fees, managing institution, and reference date, and is updated on a half-year cycle. The collection key is server-only:

```bash
export PUBLIC_DATA_PORTAL_SERVICE_KEY="<data.go.kr service key>"
pnpm data:collect-parking
```

The command writes untouched API pages to `data-work/static-parking/raw.json` and nearby candidates to `data-work/static-parking/candidates.json`. Both paths are ignored by Git. It rejects malformed coordinates, duplicate source records, duplicate name/coordinate pairs, and names or notes marked closed/unavailable; it keeps candidates within 1.5 km and never collects live vacancy counts. Every candidate still has `relationship_requires_manual_review: true`: review whether it is `on_site` or `nearby`, confirm the official page, and then copy only accepted records to `data/production/static-parking.json`. `data:collect-commons` merges that reviewed catalog into canonical `locations.json` and rechecks proximity and duplicates.

After migration `20261004000000_static_parking_metadata.sql`, publish parking without overwriting location, permit, image, or attribution rows:

```bash
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --validate-only
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --dry-run --parking-only
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --apply --parking-only
```

The dry-run requires server-only Supabase credentials because it checks existing location foreign keys and `(location_id, name)` conflicts, but it performs no writes. Parking remains publicly readable under the existing RLS select policy; anon/authenticated write policies are not added.

### Reviewed static expected noise sources

Expected noise-source metadata uses OpenStreetMap, which is open data under the [Open Data Commons Open Database License](https://www.openstreetmap.org/copyright). Every published row retains `© OpenStreetMap contributors`, the exact OSM element URL, ODbL name/link, source snapshot date, and verification time. It describes only a mapped static environmental feature; it never stores a live reading, measured or predicted dB value, or a guarantee that noise will occur.

Collect a small, explicitly selected review batch with location UUIDs:

```bash
pnpm data:collect-noise <location-uuid> [additional-location-uuid ...]
```

The command writes untouched responses to `data-work/static-noise-sources/raw.json` and review candidates to `data-work/static-noise-sources/candidates.json`; neither file is promoted automatically. Candidate discovery accepts mapped airports/runways within 5 km, visible railway within 2 km, motorway/trunk/primary roads within 1 km, and explicitly tagged construction within 1.5 km. It excludes tunnelled/covered railway and tunnelled road candidates. Review the feature type, source element, description, and relevance before copying an item to `data/production/static-noise-sources.json`.

The committed catalog currently provides five reviewed environmental features for four locations. All other locations deliberately keep `noiseSources: []`, which the detail page presents as unavailable information. Verification older than 365 days, malformed provenance, duplicate source URLs, unsupported kinds, or a feature farther than 5 km block validation. `data:collect-commons` merges the catalog and recalculates straight-line distance from the canonical location coordinate.

After migration `20261004000001_structured_noise_sources.sql`, publish only reviewed noise metadata without overwriting other location fields:

```bash
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --validate-only
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --dry-run --noise-only
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --apply --noise-only
```

The migration converts legacy string arrays and `{ kind, note }` entries to a structured legacy form with null attribution rather than inventing provenance. Runtime mapping retains the same compatibility for pre-migration databases. Malformed structured entries and duplicate source URLs are dropped with server warnings.

`data:import-production` reads `image-licenses.json` from the directory containing `locations.json` by default. Use `--image-licenses <path>` only when the reviewed catalog lives elsewhere. It joins attribution by stable `image_id`, rejects missing or duplicate license records, mismatched location ownership, and non-HTTP(S) source/license URLs. Reusing the same source image in different locations remains valid when each use has its own stable image UUID and reviewed catalog entry.

`data:check-attribution-links` checks the canonical place source, permit-specific official source, each reviewed parking and expected-noise source, each Commons source page, and every license URL before publishing. Duplicate URLs are requested once while the JSON report retains every location/image/parking/noise reference that uses them. HTTP 404/410 responses are reported as `broken` and make the command fail only after a range `GET` confirms the `HEAD` result. Authentication, rate-limit, server, timeout, and network failures remain `unverified` so the report does not falsely call a provider-blocked URL broken. Providers that reject or do not implement `HEAD` are retried with a one-byte range `GET`. Review both `broken` and `unverified` rows; never replace a source URL with a guessed URL.

After the schema migrations are installed, use the explicit production import sequence below from a trusted local shell. The service-role key must never be placed in a `NEXT_PUBLIC_*` variable or Vercel. The first importer writes location and image metadata; the second adds the validated vectors to those image rows. Both operations are idempotent by stable UUID. Always run `--dry-run` immediately before `--apply`.

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SECRET_KEY="<server-only secret>"
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --dry-run
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --apply
pnpm embeddings:import data/production/embeddings.json --dry-run
pnpm embeddings:import data/production/embeddings.json --apply
```

For legacy rows that already contain curated permit/contact or other operational fields, refresh only attribution columns:

```bash
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --dry-run --attribution-only
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --apply --attribution-only
```

This mode updates only `source`, `source_url`, `author`, `license`, `license_url`, and `last_verified_at` on existing location/image UUIDs. It never inserts missing rows and cannot be combined with `--insert-only`. The dry-run counts show how many canonical UUIDs currently exist before the apply step.

To publish reviewed permit fields without overwriting coordinates, descriptions, image rows, or location attribution, install the permit-provenance migration and use the dedicated partial scope:

```bash
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --dry-run --permit-only
pnpm data:import-production data/production/locations.json data/production/embeddings-manifest.json --apply --permit-only
```

`--permit-only` updates only reviewed permit rows for existing location UUIDs, and only the `permit_type`, contact fields, `permit_note`, and four permit provenance columns. Generic `문의 필요` rows whose permit source is still the place source are skipped so this safe backfill cannot erase separately curated database contacts. It does not query or write `location_images`, never inserts a missing location, and cannot be combined with `--insert-only`.

### Reviewed expansion and safe incremental publishing

`expansion-review-decisions.json` records entity/category/region decisions; `extra-view-selections.json` records ten additional scene photos selected from Commons categories. Recheck accepted entities against the generated discovery report:

```bash
node --experimental-strip-types scripts/data/expand-reviewed.ts \
  data-work/wikidata/commons-manifest-balanced.report.json \
  data/production/expansion-review-decisions.json \
  data/production/commons-manifest.json data-work/reviewed-candidates.json
```

The report is generated by discovery, not a committed production artifact. The helper rechecks official P18 images and Earth coordinates, supported category/region decisions, source SHA-1, and existing proximity/name gates. It emits candidates only; visually review every photo before promoting it. The collector rechecks licenses every run and reuses bytes only when source revision, thumbnail URL, JPEG signature, and SHA-256 match. Changed source content under an existing UUID fails closed: review and assign a new image UUID rather than retain a stale vector. Interrupted downloads have ignored atomic receipts under `data-work/commons-downloads`.

Storage upload first repeats metadata/license-manifest validation, then requires every reviewed local JPEG before writing. It never downloads a missing image. It retains four upload buffers, skips matching size/MIME/ETag objects, and refuses to overwrite different bytes. The MD5 ETag is an idempotency check, not a copyright/security assertion. Bucket permissions remain unchanged.

Use `--insert-only` with metadata `--dry-run` and `--apply` when expanding a live catalog: existing place/image records, including curated permit/contact data, are preserved. Default full upsert remains available for deliberate reviewed metadata refreshes. Install attribution and filtered-search migrations before publishing. Verify DB attribution as well as the license file; use `--attribution-only` for legacy rows instead of a blanket overwrite of operational place metadata. Embedding import remains separate.

## Validation gates

The validator has two explicit modes. A mode is mandatory so a clean clone cannot accidentally treat intentionally absent working images as corrupt production metadata.

- `--metadata-only` validates location/permit/parking metadata, remote HTTP(S) URLs, alt text, and image-path metadata without reading local bytes. For production data, pass both manifests so it also checks stable image UUIDs, location ownership, source URLs, author/license/license URL fields, and exact dataset/embedding/license coverage.
- `--require-local-assets` performs the same structural checks and additionally requires every `imagePath` to be a readable regular file below the explicitly supplied `--image-root`. When the production manifests are supplied, byte size and SHA-256 must match the reviewed license catalog. Use this before embedding preparation or Storage upload, after approved asset restoration.

Clean-clone production validation does not require Supabase credentials, Kakao keys, model downloads, or `public/locations/*.jpg`:

```bash
pnpm install --frozen-lockfile
pnpm data:validate \
  data/production/locations.json \
  data/production/validation-report.json \
  --metadata-only \
  --embedding-manifest data/production/embeddings-manifest.json \
  --image-licenses data/production/image-licenses.json
pnpm embeddings:import data/production/embeddings.json --validate-only
pnpm embeddings:audit-schema
pnpm build
```

Local-original validation is deliberately separate:

```bash
pnpm data:validate \
  data/production/locations.json \
  data-work/reports/production-local-assets.json \
  --require-local-assets \
  --image-root . \
  --embedding-manifest data/production/embeddings-manifest.json \
  --image-licenses data/production/image-licenses.json
```

The command writes a deterministic report with the validation `mode`, input paths and SHA-256 values, `valid`, aggregate counts, and every detected error. A passing run atomically replaces the requested report. A failing run exits with status 1 and writes a sibling such as `validation-report.failed.metadata-only.json`; it never overwrites the last approved passing report. It checks:

- required, UUID-formatted, case-insensitively unique location IDs;
- non-blank names and addresses;
- canonical category and region values;
- finite latitude `[-90, 90]` and longitude `[-180, 180]`;
- safe permit guidance, valid nullable public phone numbers, and HTTP(S) source/image URLs;
- location, permit, parking, and expected-noise provenance names, URLs, reference dates, and verification timestamps;
- explicit `on_site`/`nearby` parking relationships and duplicate parking name/coordinate pairs;
- structured expected-noise kinds, distance/evidence, license attribution, freshness, and duplicate source URLs;
- at least one image, non-blank alt text, and a local image-path declaration;
- production embedding/license manifest consistency when both manifests are provided;
- local file existence/type/readability only in `--require-local-assets` mode.

Validation never uploads, downloads, modifies, or decodes images, and it does not connect to Supabase. A passing report proves the selected checks and manifest relationships only; it does not replace human review of data accuracy, license authorization, or changed upstream content.
