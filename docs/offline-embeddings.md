# Offline location embeddings

The offline pipeline prepares licensed location images for later review and import into `location_images`. It never uploads files or writes to Supabase.

## Manifest contract

Start from `scripts/embeddings/manifest.example.json`. The top-level object has `schema_version: 1` and a non-empty `items` array. Every item is strict: unknown fields, malformed UUIDs, malformed URLs, empty strings, and duplicate `image_id` values are rejected before the model loads.

| Field | Meaning |
| --- | --- |
| `image_id` | UUID for the future `location_images.id` row |
| `location_id` | Existing `locations.id` UUID |
| `image_path` | Local JPEG, PNG, or WebP path, resolved relative to the manifest |
| `image_url` | Intended public authorized image URL stored in the database |
| `source` | Owner, creator, or authorized dataset name |
| `source_url` | HTTP(S) provenance, permission, or license record |

Only use images with confirmed processing and redistribution rights. Record full attribution requirements in `DATA_LICENSES.md`; a URL in the manifest is metadata, not proof of permission. The pipeline intentionally does not download remote URLs.

## Run

```bash
pnpm embeddings:prepare path/to/manifest.json path/to/output.json
pnpm embeddings:prepare path/to/manifest.json path/to/output.json --batch-size 16 --retries 2
pnpm embeddings:prepare path/to/manifest.json path/to/output.json --no-resume
```

- `--batch-size` defaults to 8 and accepts 1–64.
- `--retries` defaults to 1 and accepts 0–5. It retries transient model failures within the current batch.
- Resume is enabled by default. Matching successful `image_id` records are skipped, while failed records are retried.
- `--no-resume` ignores an existing output and regenerates all manifest items.

Use one writer per output path. The model is loaded once per process. Each completed batch is written to `output.json.tmp` and atomically renamed, so an interruption preserves the last complete checkpoint.

## Validation and output

The pipeline checks file existence, regular-file status, byte signatures, the 15 MB encoded limit, successful decoding, the 8192 px axis limit, and the 20 megapixel limit. Extensions are not trusted. Runtime and offline preparation both use:

- model: `Xenova/clip-vit-base-patch32`
- revision: `main`
- embedding dimension: 512
- Transformers.js `image-feature-extraction` preprocessing

Each successful item repeats the model ID, revision, installed Transformers.js version, source metadata, and a finite 512-D embedding. The root `model` object provides the same import-wide metadata. Failures contain the full manifest entry, cumulative attempt count, and error. Output ordering always follows manifest ordering and omits timestamps for deterministic reruns.

Resume refuses output created by a different Transformers.js version. If manifest metadata changes for an existing `image_id`, that image is recomputed. A malformed persisted vector, duplicate output ID, or completed/failed overlap stops the run instead of silently trusting corrupt state.

The process exits non-zero when failures remain, but the valid checkpoint stays available. Fix the source problem and rerun the same command; successful items will be skipped and failed items retried.

## Review before import

Before DAY 4 database import, review:

1. `failures` is empty.
2. Every UUID refers to the intended controlled database record.
3. `source`, `source_url`, `image_url`, and `DATA_LICENSES.md` agree.
4. Root and item model metadata match the importer configuration.
5. No local path, credential, or unlicensed asset is being published accidentally.
