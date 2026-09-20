import { describe, expect, it } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "../../src/lib/ai/embedding-service.ts";
import { createEmptyOutput, parseManifest, parseOutput } from "./contracts.ts";

const entry = {
  image_id: "00000000-0000-4000-8000-000000000001",
  location_id: "00000000-0000-4000-8000-000000000101",
  image_path: "./image.png",
  image_url: "https://example.com/image.png",
  source: "Synthetic test fixture",
  source_url: "https://example.com/license",
};

describe("embedding contracts", () => {
  it("parses the versioned manifest", () => {
    expect(parseManifest({ schema_version: 1, items: [entry] }).items).toEqual([entry]);
  });

  it("rejects malformed entries and duplicate image IDs", () => {
    expect(() => parseManifest({ schema_version: 1, items: [{ ...entry, source_url: "file:///tmp" }] }))
      .toThrow();
    expect(() => parseManifest({ schema_version: 1, items: [entry, entry] }))
      .toThrow("Duplicate image_id");
  });

  it("rejects malformed persisted vectors and overlapping states", () => {
    const output = createEmptyOutput("4.3.0");
    output.items.push({
      ...entry,
      model_id: output.model.id,
      model_revision: output.model.revision,
      transformers_js_version: "4.3.0",
      embedding: [1, 2],
    });
    expect(() => parseOutput(output)).toThrow();

    output.items[0].embedding = new Array(CLIP_EMBEDDING_DIMENSION).fill(0);
    output.failures.push({ ...entry, attempts: 1, error: "failed" });
    expect(() => parseOutput(output)).toThrow("completed and failed");
  });
});
