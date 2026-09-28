import { describe, expect, it } from "vitest";
import {
  compareRetrievalConfigurations,
  evaluateRetrieval,
  formatEvaluationReport,
  parseEvaluationDataset,
  verifyEvaluationReferenceImages,
  type EvaluationConfiguration,
} from "./evaluation";

const fixture = () => parseEvaluationDataset({
  schema_version: 1,
  name: "test set",
  provenance: {
    kind: "synthetic",
    license: "MIT",
    source_url: "https://example.com/license",
    score_origin: "curated-ranking-scenario",
  },
  queries: [
    {
      query_id: "urban-query",
      category: "urban",
      reference_image_path: "images/urban.png",
      expected_location_ids: ["urban-a"],
      qualitative_note: "The max and mean strategies intentionally disagree.",
      hits: [
        { location_image_id: "a-1", location_id: "urban-a", similarity: 0.9 },
        { location_image_id: "a-2", location_id: "urban-a", similarity: 0.1 },
        { location_image_id: "b-1", location_id: "urban-b", similarity: 0.8 },
        { location_image_id: "b-2", location_id: "urban-b", similarity: 0.7 },
      ],
    },
    {
      query_id: "nature-query",
      category: "nature",
      reference_image_path: "images/nature.png",
      expected_location_ids: ["nature-a", "nature-b"],
      qualitative_note: "Two acceptable matches exercise Recall@K.",
      hits: [
        { location_image_id: "n-x", location_id: "nature-x", similarity: 0.9 },
        { location_image_id: "n-a", location_id: "nature-a", similarity: 0.8 },
        { location_image_id: "n-y", location_id: "nature-y", similarity: 0.7 },
        { location_image_id: "n-b", location_id: "nature-b", similarity: 0.6 },
      ],
    },
  ],
});

const maxConfiguration: EvaluationConfiguration = {
  name: "max",
  aggregation: { strategy: "max" },
  minimumSimilarity: 0,
};

describe("retrieval evaluation", () => {
  it("calculates Top-K, macro Recall@K, reciprocal rank, and per-category metrics", () => {
    const result = evaluateRetrieval(fixture(), maxConfiguration);
    expect(result.metrics).toEqual({
      top1: 0.5,
      top3: 1,
      top5: 1,
      recallAt1: 0.5,
      recallAt3: 0.75,
      recallAt5: 1,
      meanReciprocalRank: 0.75,
      emptyResultRate: 0,
    });
    expect(result.byCategory.urban).toEqual({ queryCount: 1, top1: 1, top3: 1, top5: 1 });
    expect(result.byCategory.interior).toEqual({ queryCount: 0, top1: 0, top3: 0, top5: 0 });
  });

  it("compares max and top-k mean without changing the source dataset", () => {
    const dataset = fixture();
    const snapshot = structuredClone(dataset);
    const results = compareRetrievalConfigurations(dataset, [
      maxConfiguration,
      { name: "mean", aggregation: { strategy: "top-k-mean", k: 2 }, minimumSimilarity: 0 },
    ]);
    expect(results[0].queries[0].rankedLocationIds[0]).toBe("urban-a");
    expect(results[1].queries[0].rankedLocationIds[0]).toBe("urban-b");
    expect(dataset).toEqual(snapshot);
  });

  it("treats threshold-empty queries as misses instead of dropping them", () => {
    const result = evaluateRetrieval(fixture(), {
      name: "strict",
      aggregation: { strategy: "max" },
      minimumSimilarity: 0.95,
    });
    expect(result.metrics.emptyResultRate).toBe(1);
    expect(result.metrics.top5).toBe(0);
    expect(result.queries.every((query) => query.firstRelevantRank === null)).toBe(true);
  });

  it("rejects malformed, duplicate, and unverifiable expectations", () => {
    const valid = fixture();
    expect(() => parseEvaluationDataset({ ...valid, queries: [valid.queries[0], valid.queries[0]] }))
      .toThrow("Duplicate query_id");
    expect(() => parseEvaluationDataset({
      ...valid,
      queries: [{ ...valid.queries[0], expected_location_ids: ["missing"] }],
    })).toThrow("has no candidate hit");
    expect(() => parseEvaluationDataset({
      ...valid,
      queries: [{
        ...valid.queries[0],
        hits: [...valid.queries[0].hits, { ...valid.queries[0].hits[0] }],
      }],
    })).toThrow("Duplicate location_image_id");
    expect(() => parseEvaluationDataset({
      ...valid,
      provenance: { ...valid.provenance, score_origin: "clip-cosine" },
    })).toThrow("requires model provenance");
  });

  it("emits a deterministic human-readable comparison and baseline failures", () => {
    const dataset = fixture();
    const report = formatEvaluationReport(dataset, [evaluateRetrieval(dataset, maxConfiguration)]);
    expect(report).toContain("max | 50.0% | 100.0% | 100.0%");
    expect(report).toContain("nature-query: expected=nature-a,nature-b");
  });

  it("rejects duplicate configuration names", () => {
    expect(() => compareRetrievalConfigurations(fixture(), [maxConfiguration, maxConfiguration]))
      .toThrow("Duplicate configuration name");
  });

  it("fails clearly when a referenced evaluation image is absent", async () => {
    await expect(verifyEvaluationReferenceImages(fixture(), "/definitely-missing"))
      .rejects.toThrow("Missing reference image for urban-query");
  });
});
