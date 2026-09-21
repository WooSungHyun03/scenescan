import { describe, expect, it, vi } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "../../src/lib/ai/embedding-service.ts";
import { createEmptyOutput, type EmbeddingOutput } from "./contracts.ts";
import { createImportRows, importEmbeddings, type EmbeddingImportDatabase } from "./importer.ts";

const imageId = "00000000-0000-4000-8000-000000000001";
const locationId = "00000000-0000-4000-8000-000000000101";

function validOutput(): EmbeddingOutput {
  const output = createEmptyOutput("4.3.0");
  output.items.push({
    image_id: imageId,
    location_id: locationId,
    image_path: "./image.png",
    image_url: "https://example.com/image.png",
    source: "Synthetic test fixture",
    source_url: "https://example.com/license",
    model_id: output.model.id,
    model_revision: output.model.revision,
    transformers_js_version: "4.3.0",
    embedding: [1, ...new Array(CLIP_EMBEDDING_DIMENSION - 1).fill(0)],
  });
  return output;
}

function database(overrides: Partial<EmbeddingImportDatabase> = {}): EmbeddingImportDatabase {
  return {
    findLocationIds: vi.fn(async () => [locationId]),
    findExistingImages: vi.fn(async () => []),
    probeRpc: vi.fn(async () => []),
    upsertImages: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("embedding importer", () => {
  it("validates offline without database access", async () => {
    await expect(importEmbeddings(validOutput(), "validate-only", 100)).resolves.toEqual({
      mode: "validate-only", validated: 1, existing: 0, written: 0,
    });
  });

  it("rejects unresolved failures, duplicate URLs, and zero-norm vectors", () => {
    const failed = validOutput();
    failed.failures.push({ ...failed.items[0], attempts: 1, error: "decode failed" });
    failed.items = [];
    expect(() => createImportRows(failed)).toThrow("unresolved failure");

    const duplicate = validOutput();
    duplicate.items.push({ ...duplicate.items[0], image_id: "00000000-0000-4000-8000-000000000002" });
    expect(() => createImportRows(duplicate)).toThrow("Duplicate image_url");

    const zero = validOutput();
    zero.items[0].embedding.fill(0);
    expect(() => createImportRows(zero)).toThrow("zero norm");
  });

  it("checks foreign keys and prevents cross-location ID replacement", async () => {
    await expect(importEmbeddings(validOutput(), "dry-run", 100, database({ findLocationIds: vi.fn(async () => []) })))
      .rejects.toThrow("Missing location_id");
    const db = database({
      findExistingImages: vi.fn(async () => [{ id: imageId, location_id: "00000000-0000-4000-8000-000000000999" }]),
    });
    await expect(importEmbeddings(validOutput(), "dry-run", 100, db)).rejects.toThrow("different location");
  });

  it("probes cosine RPC in dry-run and writes only in apply mode", async () => {
    const dryRunDb = database({ findExistingImages: vi.fn(async () => [{ id: imageId, location_id: locationId }]) });
    await expect(importEmbeddings(validOutput(), "dry-run", 100, dryRunDb)).resolves.toMatchObject({ written: 0, existing: 1 });
    expect(dryRunDb.probeRpc).toHaveBeenCalledOnce();
    expect(dryRunDb.upsertImages).not.toHaveBeenCalled();

    const applyDb = database();
    await expect(importEmbeddings(validOutput(), "apply", 1, applyDb)).resolves.toMatchObject({ written: 1 });
    expect(applyDb.upsertImages).toHaveBeenCalledOnce();
  });

  it("rejects malformed RPC similarity and unsafe batch sizes", async () => {
    const db = database({
      probeRpc: vi.fn(async () => [{ location_image_id: imageId, location_id: locationId, similarity: Number.NaN }]),
    });
    await expect(importEmbeddings(validOutput(), "dry-run", 100, db)).rejects.toThrow("invalid cosine similarity");
    await expect(importEmbeddings(validOutput(), "validate-only", 0)).rejects.toThrow("between 1 and 500");
  });
});
