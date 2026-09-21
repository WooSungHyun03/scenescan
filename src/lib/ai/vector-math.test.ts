import { describe, expect, it } from "vitest";
import { cosineSimilarity, normalizeVector, vectorNorm } from "./vector-math";

describe("vector math", () => {
  it("normalizes finite vectors", () => {
    const normalized = normalizeVector([3, 4]);
    expect(normalized).toEqual([0.6, 0.8]);
    expect(vectorNorm(normalized)).toBeCloseTo(1, 12);
  });

  it("matches cosine similarity before and after normalization", () => {
    const left = [3, 4, 0];
    const right = [4, 0, 3];
    expect(cosineSimilarity(left, right)).toBeCloseTo(
      cosineSimilarity(normalizeVector(left), normalizeVector(right)),
      12,
    );
  });

  it("rejects malformed cosine inputs", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow("equal dimensions");
    expect(() => cosineSimilarity([0, 0], [1, 0])).toThrow("zero vector");
    expect(() => vectorNorm([1, Number.NaN])).toThrow("non-finite");
  });
});
