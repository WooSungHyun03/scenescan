# Browser AI performance

## Runtime policy

- Model: `Xenova/clip-vit-base-patch32` at revision `main`
- Output contract: finite, normalized 512-dimensional vectors
- Browser backend: explicit Transformers.js `wasm`
- Lifecycle: one lazily created Worker per service and one shared model promise per Worker
- Diagnostics: the latest 20 successful requests only; no image bytes or embeddings are retained

WASM is the production baseline because it works without WebGPU. WebGPU is not selected automatically: it needs a separate device matrix covering model load, output parity, repeated inference, cancellation, and worker restart before it can become an opt-in mode.

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

The worker now reports `decodeMs`, `modelWaitMs`, `inferenceMs`, `totalMs`, and whether its model promise was already cached. The main-thread service adds total elapsed and transfer/queue overhead, returns defensive copies, and drops samples beyond 20. Unit tests verify singleton model loading, repeated requests, timeout, cancellation, crash recreation, timing boundaries, and bounded retention.

## Remaining device matrix

1. Clear only the model browser cache and measure first-visit bytes, download duration, model initialization, and first inference on at least one typical laptop.
2. Run 50–100 repeated searches while collecting browser heap outside the automation sandbox; confirm that retained memory plateaus after model initialization.
3. In a separate experimental build, request `webgpu`, compare the same image embeddings against WASM, and keep automatic fallback disabled until failures and output drift are understood.
4. Record browser/OS/hardware and Transformers.js version with every result; do not compare unlike environments as if they were the same benchmark.
