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

## Validate and import

Validation is the default and needs no database credentials:

```bash
pnpm embeddings:import path/to/output.json
pnpm embeddings:import path/to/output.json --validate-only
```

It rejects unresolved failures, empty output, duplicate IDs or public URLs, wrong model metadata, non-finite or non-512-D vectors, and zero-norm vectors. Before any write, dry-run connects to Supabase, confirms that every `location_id` exists, prevents an existing image UUID from being reassigned to another location, and probes the cosine-search RPC:

```bash
SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
pnpm embeddings:import path/to/output.json --dry-run

SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
pnpm embeddings:import path/to/output.json --apply --batch-size 100
```

`--batch-size` accepts 1–500. Apply uses UUID-based upsert only after all preflight checks pass. It will update the authorized `image_url` and embedding for the same image UUID, but refuses to move that UUID between locations. Run one importer at a time and retain the reviewed output as the reproducible source.

The service role bypasses RLS. Keep it in a shell or uncommitted server-only environment, never a `NEXT_PUBLIC_*` variable, browser bundle, CI log, or Vercel client environment. Rotate it immediately if exposed. Public application traffic continues to use the anon key and select-only RLS.

Audit the committed SQL contract independently with:

```bash
pnpm embeddings:audit-schema
```

This checks pgvector placement, 512-D columns/RPC, keys, index, RLS/read policy, cosine distance, bounded result count, and invoker rights. It does not prove that a remote migration has been applied; `--dry-run` is the remote preflight.

## Review checklist

Before DAY 4 database import, review:

1. `failures` is empty.
2. Every UUID refers to the intended controlled database record.
3. `source`, `source_url`, `image_url`, and `DATA_LICENSES.md` agree.
4. Root and item model metadata match the importer configuration and every vector has a non-zero norm.
5. No local path, credential, or unlicensed asset is being published accidentally.
