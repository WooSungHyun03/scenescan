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

The versioned output contains `name`, `description`, `category`, `region`, `address`, flattened `latitude` and `longitude`, `permit`, `images`, and `sourceUrl`. These field types are derived from `src/types/domain.ts`. Database IDs are intentionally absent because they are assigned and checked during the later controlled import step.

Validation rejects unknown mapping fields, unsafe object paths, missing required text, unmapped category or region values, non-finite or out-of-range coordinates, non-HTTP(S) image/source URLs, and missing provenance. Numeric coordinate strings and numeric category/region codes are accepted because they are common in JSON converted from CSV. Missing descriptions use the configured default. Missing permit details receive explicit nulls and the configurable `정보 확인 필요` type; no permission decision is inferred.

This command only reads local JSON and writes reviewed JSON. It does not download images, call a provider API, or write to Supabase. A source URL records provenance but does not establish redistribution rights; document the license and attribution in `DATA_LICENSES.md` before committing real records or images.
