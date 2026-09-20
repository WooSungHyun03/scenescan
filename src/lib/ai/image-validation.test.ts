import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
} from "./embedding-service";
import { validateImageBlob, validateImageDimensions } from "./image-validation";

describe("image input validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(() => validateImageBlob(new Blob(["image"], { type }))).not.toThrow();
  });

  it("rejects empty, oversized, and unsupported blobs", () => {
    expect(() => validateImageBlob(new Blob([], { type: "image/png" }))).toThrow("empty");
    expect(() => validateImageBlob(
      new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: "image/png" }),
    )).toThrow("15 MB");
    expect(() => validateImageBlob(new Blob(["svg"], { type: "image/svg+xml" })))
      .toThrow("JPEG, PNG, or WebP");
  });

  it("accepts bounded decoded dimensions", () => {
    expect(() => validateImageDimensions(4096, 4096)).not.toThrow();
  });

  it("rejects malformed, overlong, and excessive-pixel dimensions", () => {
    expect(() => validateImageDimensions(0, 100)).toThrow("invalid dimensions");
    expect(() => validateImageDimensions(MAX_IMAGE_DIMENSION + 1, 1)).toThrow("dimensions");
    expect(() => validateImageDimensions(5000, Math.ceil(MAX_IMAGE_PIXELS / 5000) + 1))
      .toThrow("megapixel");
  });
});
