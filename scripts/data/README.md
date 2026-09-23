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

Validation rejects unknown mapping fields, unsafe object paths, missing required text, unmapped category or region values, non-finite or out-of-range coordinates, non-HTTP(S) image/source URLs, and missing provenance. Numeric coordinate strings and numeric category/region codes are accepted because they are common in JSON converted from CSV. Missing descriptions use the configured default. Missing permit details receive explicit nulls and the configurable `정보 확인 필요` type; no permission decision is inferred.

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
- permit type and HTTP(S) source/image URLs;
- at least one image, non-blank alt text, a local image path, and whether that path is a regular file.

Validation reads file metadata only. It does not upload, modify, or decode images, and it does not connect to Supabase. A passing report means the checked structure is safe to hand to the next import review; it does not prove data accuracy, licensing, or authorization.
