import { describe, expect, it, vi } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";
import { MockEmbeddingService } from "./mock-embedding-service";

describe("MockEmbeddingService", () => {
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
    expect(listener).toHaveBeenCalledWith({ state: "ready" });
  });

  it("keeps input validation consistent with real mode", async () => {
    const service = new MockEmbeddingService();
    await expect(service.embed(new Blob(["svg"], { type: "image/svg+xml" })))
      .rejects.toThrow("Unsupported image type");
  });
});
