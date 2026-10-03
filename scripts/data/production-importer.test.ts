import { describe, expect, it, vi } from "vitest";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  createProductionRows,
  importProductionData,
  parseProductionEmbeddingManifest,
  parseImageLicenseCatalog,
  type ProductionImportDatabase,
} from "./production-importer.ts";

const locationId = "00000000-0000-4000-8000-000000000001";
const imageId = "00000000-0000-4000-8000-000000000002";
const imageUrl = "https://example.com/image.jpg";

function inputs() {
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
  const manifest = parseProductionEmbeddingManifest({
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
  const licenses = parseImageLicenseCatalog({
    schema_version: 1,
    verified_at: "2026-09-29T13:00:00+09:00",
    items: [{
      image_id: imageId,
      location_id: locationId,
      commons_page_url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
      author: "Test Author",
      license: "CC BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0",
    }],
  });
  return { data, manifest, licenses };
}

function rows() {
  const { data, manifest, licenses } = inputs();
  return createProductionRows(data, manifest, licenses);
}

function database(overrides: Partial<ProductionImportDatabase> = {}): ProductionImportDatabase {
  return {
    findLocationIds: vi.fn(async () => []),
    findExistingImages: vi.fn(async () => []),
    upsertLocations: vi.fn(async () => undefined),
    upsertImages: vi.fn(async () => undefined),
    updateLocationAttribution: vi.fn(async () => undefined),
    updateImageAttribution: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("production data importer", () => {
  it("preserves existing production metadata during append-only expansion", async () => {
    const db = database({ findLocationIds: vi.fn(async () => [locationId]),
      findExistingImages: vi.fn(async () => [{ id: imageId, location_id: locationId }]) });
    await expect(importProductionData(rows(), "apply", 100, db, true)).resolves.toMatchObject({ locationsWritten: 0, imagesWritten: 0 });
    expect(db.upsertLocations).not.toHaveBeenCalled();
    expect(db.upsertImages).not.toHaveBeenCalled();
  });

  it("allows a new view without replacing an existing location's permit metadata", async () => {
    const db = database({ findLocationIds: vi.fn(async () => [locationId]) });
    await expect(importProductionData(rows(), "apply", 100, db, true)).resolves.toMatchObject({ locationsWritten: 0, imagesWritten: 1 });
    expect(db.upsertLocations).not.toHaveBeenCalled();
    expect(db.upsertImages).toHaveBeenCalled();
  });

  it("updates only attribution fields on existing rows", async () => {
    const db = database({
      findLocationIds: vi.fn(async () => [locationId]),
      findExistingImages: vi.fn(async () => [{ id: imageId, location_id: locationId }]),
    });

    await expect(importProductionData(rows(), "apply", 100, db, false, "attribution-only")).resolves.toMatchObject({
      writeScope: "attribution-only",
      locationsWritten: 1,
      imagesWritten: 1,
    });
    expect(db.upsertLocations).not.toHaveBeenCalled();
    expect(db.upsertImages).not.toHaveBeenCalled();
    expect(db.updateLocationAttribution).toHaveBeenCalledWith([{
      id: locationId,
      source: "official",
      source_url: "https://example.com",
      author: null,
      license: null,
      license_url: null,
      last_verified_at: null,
    }]);
    expect(db.updateImageAttribution).toHaveBeenCalledWith([expect.objectContaining({
      id: imageId,
      source_url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
      author: "Test Author",
      license: "CC BY 4.0",
    })]);
  });

  it("never inserts missing rows in attribution-only mode", async () => {
    const db = database();

    await expect(importProductionData(rows(), "apply", 100, db, false, "attribution-only")).resolves.toMatchObject({
      locationsWritten: 0,
      imagesWritten: 0,
    });
    expect(db.updateLocationAttribution).not.toHaveBeenCalled();
    expect(db.updateImageAttribution).not.toHaveBeenCalled();
  });

  it("rejects contradictory insert-only and attribution-only modes", async () => {
    await expect(importProductionData(rows(), "apply", 100, database(), true, "attribution-only"))
      .rejects.toThrow("cannot be combined");
  });
  it("joins stable image IDs without inventing unreviewed values", () => {
    expect(rows()).toEqual({
      locations: [expect.objectContaining({ id: locationId, permit_type: "문의 필요", noise_sources: [] })],
      images: [{
        id: imageId,
        location_id: locationId,
        image_url: imageUrl,
        alt: "대체 텍스트",
        source: "Wikimedia Commons",
        source_url: "https://commons.wikimedia.org/wiki/File:Test.jpg",
        author: "Test Author",
        license: "CC BY 4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0",
        last_verified_at: "2026-09-29T13:00:00+09:00",
      }],
    });
  });

  it("rejects unsafe attribution URLs and preserves explicitly missing metadata", () => {
    expect(() => parseImageLicenseCatalog({
      schema_version: 1,
      verified_at: "2026-09-29T13:00:00+09:00",
      items: [{
        image_id: imageId,
        location_id: locationId,
        commons_page_url: "javascript:alert(1)",
      }],
    })).toThrow();

    const missing = parseImageLicenseCatalog({
      schema_version: 1,
      verified_at: "2026-09-29T13:00:00+09:00",
      items: [{ image_id: imageId, location_id: locationId }],
    });
    expect(missing.items[0]).toMatchObject({
      sourceUrl: null,
      author: null,
      license: null,
      licenseUrl: null,
    });
  });

  it("supports the same image URL in multiple locations with distinct image IDs", () => {
    const secondLocationId = "00000000-0000-4000-8000-000000000003";
    const secondImageId = "00000000-0000-4000-8000-000000000004";
    const { data, manifest, licenses } = inputs();
    data.locations.push({ ...data.locations[0], id: secondLocationId, name: "테스트 2" });
    manifest.items.push({ ...manifest.items[0], image_id: secondImageId, location_id: secondLocationId });
    licenses.items.push({ ...licenses.items[0], imageId: secondImageId, locationId: secondLocationId });

    expect(createProductionRows(data, manifest, licenses).images).toHaveLength(2);
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

  it("performs a read-only database preflight in dry-run mode", async () => {
    const db = database({
      findLocationIds: vi.fn(async () => [locationId]),
      findExistingImages: vi.fn(async () => [{ id: imageId, location_id: locationId }]),
    });

    await expect(importProductionData(rows(), "dry-run", 100, db)).resolves.toMatchObject({
      mode: "dry-run",
      existingLocations: 1,
      existingImages: 1,
      locationsWritten: 0,
      imagesWritten: 0,
    });
    expect(db.upsertLocations).not.toHaveBeenCalled();
    expect(db.upsertImages).not.toHaveBeenCalled();
  });

  it("rejects mismatched existing image ownership", async () => {
    const db = database({
      findExistingImages: vi.fn(async () => [{ id: imageId, location_id: "00000000-0000-4000-8000-000000000999" }]),
    });
    await expect(importProductionData(rows(), "dry-run", 100, db)).rejects.toThrow("different location");
  });
});
