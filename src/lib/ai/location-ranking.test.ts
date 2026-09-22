import { describe, expect, it } from "vitest";
import { rankLocationImageHits, type ImageSimilarityHit } from "./location-ranking";

const hit = (locationId: string, locationImageId: string, similarity: number): ImageSimilarityHit => ({
  locationId,
  locationImageId,
  similarity,
});

describe("location ranking", () => {
  it("groups image hits by location and uses max similarity by default", () => {
    expect(rankLocationImageHits([
      hit("location-a", "image-a1", 0.4),
      hit("location-b", "image-b1", 0.7),
      hit("location-a", "image-a2", 0.9),
    ])).toEqual([
      { locationId: "location-a", matchedImageId: "image-a2", similarity: 0.9, contributingImageCount: 1 },
      { locationId: "location-b", matchedImageId: "image-b1", similarity: 0.7, contributingImageCount: 1 },
    ]);
  });

  it("provides top-k mean as a pure comparison strategy", () => {
    const hits = [
      hit("location-a", "image-a1", 1),
      hit("location-a", "image-a2", 0.1),
      hit("location-b", "image-b1", 0.8),
      hit("location-b", "image-b2", 0.7),
    ];
    expect(rankLocationImageHits(hits).map((item) => item.locationId)).toEqual(["location-a", "location-b"]);
    expect(rankLocationImageHits(hits, { aggregation: { strategy: "top-k-mean", k: 2 } }))
      .toEqual([
        { locationId: "location-b", matchedImageId: "image-b1", similarity: 0.75, contributingImageCount: 2 },
        { locationId: "location-a", matchedImageId: "image-a1", similarity: 0.55, contributingImageCount: 2 },
      ]);
  });

  it("uses deterministic location and image ID tie-breaking", () => {
    const forward = [
      hit("location-b", "image-b2", 0.8),
      hit("location-a", "image-a2", 0.8),
      hit("location-a", "image-a1", 0.8),
    ];
    const expected = [
      { locationId: "location-a", matchedImageId: "image-a1", similarity: 0.8, contributingImageCount: 1 },
      { locationId: "location-b", matchedImageId: "image-b2", similarity: 0.8, contributingImageCount: 1 },
    ];
    expect(rankLocationImageHits(forward)).toEqual(expected);
    expect(rankLocationImageHits([...forward].reverse())).toEqual(expected);
  });

  it("deduplicates repeated image hits before top-k mean", () => {
    expect(rankLocationImageHits([
      hit("location-a", "image-a1", 0.5),
      hit("location-a", "image-a1", 0.9),
      hit("location-a", "image-a2", 0.7),
    ], { aggregation: { strategy: "top-k-mean", k: 3 } })[0]).toEqual({
      locationId: "location-a",
      matchedImageId: "image-a1",
      similarity: 0.8,
      contributingImageCount: 2,
    });
  });

  it("drops malformed, out-of-range, and orphan hits", () => {
    const eligibleLocationIds = new Set(["location-a"]);
    expect(rankLocationImageHits([
      hit("location-a", "valid", 0.6),
      hit("location-a", "", 0.9),
      hit("location-a", "   ", 0.9),
      hit("", "missing-location", 0.9),
      hit("   ", "blank-location", 0.9),
      hit("location-a", "nan", Number.NaN),
      hit("location-a", "high", 1.01),
      hit("location-a", "low", -1.01),
      hit("orphan", "orphan-image", 0.99),
    ], { eligibleLocationIds })).toEqual([
      { locationId: "location-a", matchedImageId: "valid", similarity: 0.6, contributingImageCount: 1 },
    ]);
  });

  it("applies an inclusive threshold and handles empty results", () => {
    const hits = [hit("location-a", "image-a", 0.5), hit("location-b", "image-b", 0.499)];
    expect(rankLocationImageHits(hits, { minimumSimilarity: 0.5 }).map((item) => item.locationId))
      .toEqual(["location-a"]);
    expect(rankLocationImageHits([], { minimumSimilarity: 1 })).toEqual([]);
  });

  it("enforces Top 8 without mutating the source hits", () => {
    const hits = Array.from({ length: 12 }, (_, index) => hit(`location-${String(index).padStart(2, "0")}`, `image-${index}`, 1 - index * 0.01));
    const snapshot = structuredClone(hits);
    expect(rankLocationImageHits(hits)).toHaveLength(8);
    expect(hits).toEqual(snapshot);
  });

  it("rejects invalid ranking options", () => {
    expect(() => rankLocationImageHits([], { limit: -1 })).toThrow("Ranking limit");
    expect(() => rankLocationImageHits([], { minimumSimilarity: Number.NaN })).toThrow("Minimum similarity");
    expect(() => rankLocationImageHits([], { aggregation: { strategy: "top-k-mean", k: 0 } })).toThrow("positive integer");
  });
});
