import { describe, expect, it, vi } from "vitest";
import { parseManifest } from "../embeddings/contracts.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  createProductionRows,
  importProductionData,
  type ProductionImportDatabase,
} from "./production-importer.ts";

const locationId = "00000000-0000-4000-8000-000000000001";
const imageId = "00000000-0000-4000-8000-000000000002";
const imageUrl = "https://example.com/image.jpg";

function rows() {
  const data = parseNormalizedLocationOutput({
    schemaVersion: 2,
    source: { name: "test" },
    locations: [{
      id: locationId,
      name: "테스트",
      description: "설명",
      category: "urban",
      region: "서울",
      address: "주소",
      latitude: 37.5,
      longitude: 127,
      permit: {
        type: "문의 필요",
        contactName: null,
        contactPhone: null,
        note: "사전 문의",
        provenance: { source: "official", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null },
      },
      parking: [],
      images: [{ imagePath: "image.jpg", imageUrl, alt: "대체 텍스트" }],
      sourceUrl: "https://example.com/license",
      provenance: { source: "official", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null },
    }],
    reviewQueue: [],
  });
  const manifest = parseManifest({
    schema_version: 1,
    items: [{
      image_id: imageId,
      location_id: locationId,
      image_path: "image.jpg",
      image_url: imageUrl,
      source: "test",
      source_url: "https://example.com/license",
    }],
  });
  return createProductionRows(data, manifest);
}

function database(overrides: Partial<ProductionImportDatabase> = {}): ProductionImportDatabase {
  return {
    findLocationIds: vi.fn(async () => []),
    findExistingImages: vi.fn(async () => []),
    upsertLocations: vi.fn(async () => undefined),
    upsertImages: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("production data importer", () => {
  it("joins stable image IDs without inventing unreviewed values", () => {
    expect(rows()).toEqual({
      locations: [expect.objectContaining({ id: locationId, permit_type: "문의 필요", noise_sources: [] })],
      images: [{ id: imageId, location_id: locationId, image_url: imageUrl, alt: "대체 텍스트" }],
    });
  });

  it("validates offline and writes locations before image metadata", async () => {
    await expect(importProductionData(rows(), "validate-only", 100)).resolves.toMatchObject({
      locationsValidated: 1,
      imagesValidated: 1,
      locationsWritten: 0,
      imagesWritten: 0,
    });
    const db = database();
    await expect(importProductionData(rows(), "apply", 100, db)).resolves.toMatchObject({
      locationsWritten: 1,
      imagesWritten: 1,
    });
    expect(db.upsertLocations).toHaveBeenCalledBefore(vi.mocked(db.upsertImages));
  });

  it("rejects mismatched existing image ownership", async () => {
    const db = database({
      findExistingImages: vi.fn(async () => [{ id: imageId, location_id: "00000000-0000-4000-8000-000000000999" }]),
    });
    await expect(importProductionData(rows(), "dry-run", 100, db)).rejects.toThrow("different location");
  });
});
