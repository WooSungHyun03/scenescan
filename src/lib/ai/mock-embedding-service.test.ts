import { describe, expect, it, vi } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";
import { MockEmbeddingService } from "./mock-embedding-service";

describe("MockEmbeddingService", () => {
  it("honors cancellation while reading the image bytes", async () => {
    let finishRead!: (bytes: ArrayBuffer) => void;
    const bytes = new Promise<ArrayBuffer>((resolve) => { finishRead = resolve; });
    const image = new Blob(["image"], { type: "image/png" });
    const chunk = image.slice(0, 4096);
    vi.spyOn(chunk, "arrayBuffer").mockReturnValue(bytes);
    vi.spyOn(image, "slice").mockReturnValue(chunk);
    const controller = new AbortController();
    const request = new MockEmbeddingService().embed(image, { signal: controller.signal });

    controller.abort();
    finishRead(new ArrayBuffer(4));

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("returns deterministic, finite, normalized 512-dimensional vectors", async () => {
    const service = new MockEmbeddingService();
    const image = new Blob(["synthetic image bytes"], { type: "image/png" });
    const first = await service.embed(image);
    const second = await service.embed(image);

    expect(first).toEqual(second);
    expect(first).toHaveLength(CLIP_EMBEDDING_DIMENSION);
    expect(first.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...first)).toBeCloseTo(1, 10);
  });

  it("reports ready status without loading external resources", () => {
    const service = new MockEmbeddingService();
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.getStatus()).toEqual({ state: "ready" });
    expect(service.getPerformanceSnapshot()).toEqual([]);
    expect(listener).toHaveBeenCalledWith({ state: "ready" });
  });

  it("keeps input validation consistent with real mode", async () => {
    const service = new MockEmbeddingService();
    await expect(service.embed(new Blob(["svg"], { type: "image/svg+xml" })))
      .rejects.toThrow("Unsupported image type");
  });
});
