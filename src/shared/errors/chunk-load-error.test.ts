import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunk-load-error";

describe("stale deployment page detection", () => {
  it("recognizes bundler chunk failures", () => {
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "Unavailable" })).toBe(true);
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/app.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 123 failed."))).toBe(true);
  });
  it("keeps ordinary application errors on the existing retry path", () => {
    expect(isChunkLoadError(new Error("Database unavailable"))).toBe(false);
    expect(isChunkLoadError(new Error("Invalid image"))).toBe(false);
  });
});
