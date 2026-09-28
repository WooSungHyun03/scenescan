# AI retrieval evaluation

## Decision

Keep the production policy unchanged: `max` image similarity per location, inclusive cosine threshold `0`, deterministic ties, and Top 8. Keep top-2 mean available only as an offline comparison. Do not enable reference + selected-location blending.

The committed evaluation establishes a reproducible regression baseline, but it does not contain real filming-location photographs. A production ranking or threshold change requires an authorized photographic corpus whose query frames differ meaningfully from the indexed location images.

## Datasets and provenance

Two complementary synthetic sets are committed:

1. `scripts/embeddings/clip-evaluation-index.json` contains ten queries and ten candidates spanning urban, nature, industrial, and interior fixture labels. The PNGs under `scripts/embeddings/evaluation-images/` are cropped/flipped derivatives of project-created SVGs and are MIT-licensed. `pnpm embeddings:evaluate-clip` runs the production `Xenova/clip-vit-base-patch32` image-feature-extraction pipeline, validates finite 512-D vectors, calculates cosine similarities, and writes `clip-evaluation-results.json` with exact model provenance.
2. `scripts/embeddings/evaluation-dataset.json` contains 12 balanced, curated multi-image ranking scenarios. It deliberately includes one-defining-view, consistent-multiple-view, false-positive, multiple-acceptable-location, low-margin, and strict-threshold failure cases. Its scores are synthetic policy probes, not CLIP quality claims.

`DATA_LICENSES.md` records both evaluation sources. No scraped or third-party photo is present in either evaluation set; the separately collected production seed is not used as evaluation evidence.

## Metrics

The evaluator reports query-level Top-1, Top-3, and Top-5 hit rate; macro Recall@1/3/5; mean reciprocal rank; empty-result rate; category slices; and baseline failure cases. Every query remains in the denominator when a threshold produces no candidates. Multiple acceptable location IDs are supported, so Recall@K is not collapsed into hit rate.

Dataset validation rejects duplicate query/image IDs, non-finite or out-of-range cosine values, duplicate expectations, expected locations absent from candidates, missing reference files, and CLIP results without model/version/dimension metadata.

## Results (2026-09-29, Node 22, Transformers.js 4.3.0)

### Measured CLIP image regression

The real model produced 20/20 finite 512-D embeddings. Each of the ten cropped/flipped queries retrieved its matching full illustration at rank 1:

| Policy | Top-1 | Top-3 | Top-5 | Recall@1/3/5 | MRR | Empty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| max, threshold 0.00 | 100% | 100% | 100% | 100% | 1.000 | 0% |
| max, threshold 0.50 | 100% | 100% | 100% | 100% | 1.000 | 0% |
| max, threshold 0.75 | 100% | 100% | 100% | 100% | 1.000 | 0% |

All categories were 100% Top-1. Correct-pair cosine scores ranged from 0.966855 to 0.977649. The rank-1 margin over the best distractor ranged from only 0.000624 to 0.012440, showing that this same-template set is useful as a deterministic inference regression but too easy and visually narrow for threshold tuning. With one candidate image per location, max and top-2 mean are necessarily identical.

### Curated ranking-policy scenarios

| Policy | Top-1 | Top-3 | Top-5 | Recall@1 | Recall@3/5 | MRR | Empty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| max, threshold 0.00 | 41.7% | 100% | 100% | 41.7% | 100% | 0.708 | 0% |
| max, threshold 0.50 | 41.7% | 100% | 100% | 41.7% | 100% | 0.708 | 0% |
| max, threshold 0.75 | 33.3% | 83.3% | 83.3% | 33.3% | 70.8% | 0.583 | 8.3% |
| top-2 mean, threshold 0.00 | 50.0% | 100% | 100% | 50.0% | 100% | 0.750 | 0% |
| top-2 mean, threshold 0.50 | 33.3% | 100% | 100% | 33.3% | 100% | 0.667 | 0% |
| top-2 mean, threshold 0.75 | 33.3% | 83.3% | 83.3% | 33.3% | 70.8% | 0.583 | 8.3% |

Top-2 mean improves the authored consistent-view cases but hurts defining-view cases. Applying the threshold before aggregation can also remove a weak second image and inflate a mean, explaining why its 0.50 result differs from 0.00. Threshold 0.75 removes valid low-margin candidates, reduces Recall@3/5 by 29.2 points, and creates empty results.

## Qualitative failures and limits

- Max favors a single strong distractor in `urban-stairs-defining-view`, `nature-water-consistent-view`, and `industrial-workshop-consistent-view`.
- Top-2 mean penalizes an otherwise defining image in `urban-brick-single-view` and `industrial-warehouse-defining-view`.
- Both strategies rank the deliberately attractive wrong category member first in the multi-answer cases; Top-3 recovers the acceptable locations.
- The measured image set shares one abstract template and mostly varies hue. It cannot measure real architecture, framing, season, lighting, or viewpoint generalization.
- A 100% score on this set is not a production quality claim. It only guards model/preprocessing/cosine/ranking regression.

## Reproduction

```bash
pnpm embeddings:evaluate
pnpm embeddings:evaluate-clip
pnpm embeddings:evaluate scripts/embeddings/clip-evaluation-results.json
```

The second command downloads/loads the public CLIP model and rewrites measured scores deterministically for the installed model version. The first and third commands are model-free and suitable for normal CI or local policy inspection.

## Next evidence needed

Acquire redistribution-authorized photographic query/location pairs with multiple views per location, document license and category balance, and rerun the same metrics. Only then compare max, top-k mean, thresholds, and optional reference/selected-location blending. Until that evidence exists, the current max/0/Top-8 policy has the least compatibility risk and preserves recall.
