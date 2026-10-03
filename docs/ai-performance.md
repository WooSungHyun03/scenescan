# Browser AI performance

## Runtime policy

- Model: `Xenova/clip-vit-base-patch32` at revision `main`
- Precision: explicitly `q8` in browser and offline pipelines; never rely on device defaults (WASM q8 vs Node fp32).
- Output contract: finite 512-dimensional projected image vectors; real browser/offline inference returns the same raw model projection. Cosine distance normalizes by vector norms at comparison time. Mock vectors are explicitly normalized; real vectors are not necessarily unit-length.
- Browser backend: Transformers.js `wasm` by default; build-time `webgpu` experiment with automatic WASM initialization fallback
- Lifecycle: one lazily created Worker per service and one shared model promise per Worker
- Concurrency: Worker decode and inference are serialized; cancelled queued requests are skipped before decode
- Diagnostics: the latest 20 successful requests only; no image bytes or embeddings are retained

WASM is the production baseline because it works without WebGPU. `NEXT_PUBLIC_CLIP_DEVICE=webgpu` enables a controlled experimental build; initialization failure retries with WASM, while failure of both backends remains a structured model-load error. Docker accepts the same option through `--build-arg NEXT_PUBLIC_CLIP_DEVICE=webgpu`, and Compose forwards the variable with `wasm` as its default. WebGPU is never selected from browser capability alone and needs a device matrix covering model load, output parity, repeated inference, cancellation, and worker restart before it can become the default.

## Production browser baseline — 2026-09-30

The measurement used `beceleb.org/search` in the Codex in-app Chromium browser, real AI/data modes, and the 0.2 MB licensed `seonyudo-park-01.jpg` reference. Timings cover the user-visible path from clicking search through browser inference, the production API request, ranking, and rendering of Top 8.

| Scenario | Result |
| --- | ---: |
| New Worker with model files already in browser cache | 3,334 ms |
| Repeated search 1 | 2,168 ms |
| Repeated search 2 | 1,947 ms |
| Repeated search 3 | 1,952 ms |
| Repeated search 4 | 2,266 ms |
| Repeated search 5 | 1,955 ms |
| Repeated mean / median | 2,058 ms / 1,955 ms |

All six searches returned eight results with 선유도공원 ranked first at 88% similarity, and the browser console contained no warning or error. This is a cache-warm model baseline, not a first-visit network download benchmark. The automation environment did not expose a trustworthy browser heap metric, so model-memory growth remains open rather than being inferred from process memory.

The worker now reports `queueWaitMs`, `decodeMs`, `modelWaitMs`, `inferenceMs`, `totalMs`, the actual execution device, and whether its model promise was already cached. The main-thread service adds total elapsed and transfer/queue overhead, returns defensive copies, and drops samples beyond 20. Worker request serialization bounds decoded-image/model concurrency at one. Cancellation messages remove queued work before decoding while preserving unrelated requests. Unit tests verify singleton model loading, serialization, queued cancellation, repeated requests, timeout, crash recreation, WebGPU-to-WASM fallback, timing boundaries, and bounded retention.

## Remaining device matrix

1. Clear only the model browser cache and measure first-visit bytes, download duration, model initialization, and first inference on at least one typical laptop.
2. Run 50–100 repeated searches while collecting browser heap outside the automation sandbox; confirm that retained memory plateaus after model initialization.
3. Build with `NEXT_PUBLIC_CLIP_DEVICE=webgpu`, compare the same image embeddings against WASM, and retain WASM as the production default until failures and output drift are understood.
4. Record browser/OS/hardware and Transformers.js version with every result; do not compare unlike environments as if they were the same benchmark.
