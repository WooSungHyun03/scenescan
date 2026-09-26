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

The versioned output contains `name`, `description`, `category`, `region`, `address`, flattened `latitude` and `longitude`, `permit`, `images`, and `sourceUrl`. These field types are derived from `src/types/domain.ts`. Map `fields.id` to a controlled location UUID and `images.localPath` to each licensed local image when preparing data for validation and import. Both fields remain optional during initial normalization so a provider extract can be reviewed before database IDs and local assets are assigned.

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

`contactName` and `contactPhone` are read only from the paths explicitly configured under `permit`. When a source does not provide those paths or values, normalization stores `null`. It does not derive contacts from the location name, permit guidance, address, or similarly named unmapped fields. The location `sourceUrl` remains the provenance reference for the stored guidance.

Validation rejects unknown mapping fields, unsafe object paths, missing required text, unmapped region values, unsafe permit guidance, non-finite or out-of-range coordinates, non-HTTP(S) image/source URLs, and missing provenance. Unmapped categories enter the review queue described above. Numeric coordinate strings and numeric category/region codes are accepted because they are common in JSON converted from CSV. Missing descriptions use the configured default. Missing permit contacts receive explicit nulls and missing permit guidance uses the configurable `문의 필요` default; no permission decision is inferred.

This command only reads local JSON and writes reviewed JSON. It does not download images, call a provider API, or write to Supabase. A source URL records provenance but does not establish redistribution rights; document the license and attribution in `DATA_LICENSES.md` before committing real records or images.

## Validation gate

Run validation after normalization and before any database import. Relative image paths are resolved from the normalized file's directory unless `--image-root` is provided.

```bash
pnpm data:validate \
  data-work/normalized/provider.json \
  data-work/reports/provider.json \
  --image-root data-work/raw/images
```

The command writes a deterministic report with `valid`, aggregate counts, and every detected error. It exits with status 1 after writing the report when validation fails, allowing CI or a future importer to block the write. It checks:

- required, UUID-formatted, case-insensitively unique location IDs;
- non-blank names and addresses;
- canonical category and region values;
- finite latitude `[-90, 90]` and longitude `[-180, 180]`;
- safe permit guidance, explicit nullable contact fields, and HTTP(S) source/image URLs;
- at least one image, non-blank alt text, a local image path, and whether that path is a regular file.

Validation reads file metadata only. It does not upload, modify, or decode images, and it does not connect to Supabase. A passing report means the checked structure is safe to hand to the next import review; it does not prove data accuracy, licensing, or authorization.
