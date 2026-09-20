import { describe, expect, it } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";
import { toValidatedEmbedding } from "./embedding-validation";

describe("toValidatedEmbedding", () => {
  it("copies a finite 512-dimensional vector", () => {
    const source = new Float32Array(CLIP_EMBEDDING_DIMENSION).fill(0.25);
    const result = toValidatedEmbedding(source);

    expect(result).toHaveLength(CLIP_EMBEDDING_DIMENSION);
    expect(result).not.toBe(source);
    expect(result.every(Number.isFinite)).toBe(true);
  });

  it("rejects a dimension mismatch", () => {
    expect(() => toValidatedEmbedding([1, 2])).toThrow("Expected 512");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite value %s",
    (invalidValue) => {
      const vector = new Array(CLIP_EMBEDDING_DIMENSION).fill(0);
      vector[37] = invalidValue;
      expect(() => toValidatedEmbedding(vector)).toThrow("index 37");
    },
  );
});
