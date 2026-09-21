import { describe, expect, it } from "vitest";
import { searchRequestSchema } from "./contracts";

const validEmbedding = () => [1, ...new Array(511).fill(0)];

describe("searchRequestSchema", () => {
  it("accepts a finite non-zero 512-dimensional embedding", () => {
    expect(searchRequestSchema.safeParse({ embedding: validEmbedding(), filters: {} }).success)
      .toBe(true);
  });

  it("rejects malformed dimensions, non-finite values, and zero norm", () => {
    expect(searchRequestSchema.safeParse({ embedding: [1], filters: {} }).success).toBe(false);
    const nonFinite = validEmbedding();
    nonFinite[20] = Number.NaN;
    expect(searchRequestSchema.safeParse({ embedding: nonFinite, filters: {} }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ embedding: new Array(512).fill(0), filters: {} }).success)
      .toBe(false);
  });
});
