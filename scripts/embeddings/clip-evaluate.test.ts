import { describe, expect, it } from "vitest";
import { CLIP_EMBEDDING_DIMENSION, CLIP_MODEL_ID } from "../../src/lib/ai/embedding-service";
import {
  buildClipEvaluationDataset,
  parseClipEvaluationIndex,
} from "./clip-evaluate";
import { evaluateRetrieval } from "./evaluation";

const unitVector = (index: number): number[] => Array.from(
  { length: CLIP_EMBEDDING_DIMENSION },
  (_, position) => position === index ? 1 : 0,
);

const fixture = () => parseClipEvaluationIndex({
  schema_version: 1,
  name: "CLIP test",
  license: "MIT",
  source_url: "https://example.com/license",
  candidates: [
    { location_id: "a", location_image_id: "a-image", category: "urban", image_path: "a.png" },
    { location_id: "b", location_image_id: "b-image", category: "nature", image_path: "b.png" },
  ],
  queries: [
    { query_id: "query-a", category: "urban", image_path: "query-a.png", expected_location_ids: ["a"] },
    { query_id: "query-b", category: "nature", image_path: "query-b.png", expected_location_ids: ["b"] },
  ],
});

describe("CLIP retrieval evaluation", () => {
  it("builds validated cosine hits with exact model provenance", () => {
    const embeddings = new Map([
      ["a.png", unitVector(0)],
      ["b.png", unitVector(1)],
      ["query-a.png", unitVector(0)],
      ["query-b.png", unitVector(1)],
    ]);
    const dataset = buildClipEvaluationDataset(fixture(), embeddings, "4.3.0");
    expect(dataset.provenance.model).toEqual({
      id: CLIP_MODEL_ID,
      revision: "main",
      embedding_dimension: 512,
      transformers_js_version: "4.3.0",
    });
    expect(evaluateRetrieval(dataset, {
      name: "max",
      aggregation: { strategy: "max" },
      minimumSimilarity: 0,
    }).metrics.top1).toBe(1);
  });

  it("rejects duplicate images and unknown expectations", () => {
    const index = fixture();
    expect(() => parseClipEvaluationIndex({ ...index, candidates: [index.candidates[0], index.candidates[0]] }))
      .toThrow("Duplicate candidate location_id");
    expect(() => parseClipEvaluationIndex({
      ...index,
      queries: [{ ...index.queries[0], expected_location_ids: ["missing"] }],
    })).toThrow("Unknown expected location");
  });

  it("rejects missing or malformed embeddings", () => {
    const embeddings = new Map([
      ["a.png", unitVector(0)],
      ["b.png", unitVector(1)],
      ["query-a.png", unitVector(0)],
    ]);
    expect(() => buildClipEvaluationDataset(fixture(), embeddings, "4.3.0"))
      .toThrow("Missing embedding for query-b.png");
    embeddings.set("query-b.png", [1, 0]);
    expect(() => buildClipEvaluationDataset(fixture(), embeddings, "4.3.0"))
      .toThrow("Expected 512 embedding dimensions");
  });
});
