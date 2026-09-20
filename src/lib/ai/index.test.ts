import { afterEach, describe, expect, it, vi } from "vitest";

describe("createImageEmbeddingService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns one shared service instance", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_AI", "true");
    const { createImageEmbeddingService } = await import("./index");

    expect(createImageEmbeddingService()).toBe(createImageEmbeddingService());
  });
});
