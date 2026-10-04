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
    findExistingParkingKeys: vi.fn(async () => []),
    upsertLocations: vi.fn(async () => undefined),
    upsertImages: vi.fn(async () => undefined),
    upsertParking: vi.fn(async () => undefined),
    updateLocationAttribution: vi.fn(async () => undefined),
    updateImageAttribution: vi.fn(async () => undefined),
    updatePermitMetadata: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("production data importer", () => {
  it("maps reviewed static parking with provenance instead of rejecting it", async () => {
    const { data, manifest, licenses } = inputs();
    data.locations[0].parking = [{
      relationship: "nearby",
      name: "공영주차장",
      latitude: 37.501,
      longitude: 127.001,
      capacity: 20,
      openingHours: "평일 09:00–18:00",
      priceInfo: "유료 · 기본 30분 1,000원",
      provenance: {
        source: "공공데이터포털",
        sourceUrl: "https://www.data.go.kr/data/15012896/standard.do",
        referenceDate: "2026-05-15",
        lastVerifiedAt: "2026-10-04T12:00:00+09:00",
      },
    }];
    const parkingRows = createProductionRows(data, manifest, licenses);
    expect(parkingRows.parking).toEqual([{
      location_id: locationId,
      relationship: "nearby",
      name: "공영주차장",
      latitude: 37.501,
      longitude: 127.001,
      capacity: 20,
      opening_hours: "평일 09:00–18:00",
      price_info: "유료 · 기본 30분 1,000원",
      source: "공공데이터포털",
      source_url: "https://www.data.go.kr/data/15012896/standard.do",
      reference_date: "2026-05-15",
      last_verified_at: "2026-10-04T12:00:00+09:00",
    }]);

    const db = database({ findLocationIds: vi.fn(async () => [locationId]) });
    await expect(importProductionData(parkingRows, "dry-run", 100, db, false, "parking-only"))
      .resolves.toMatchObject({ parkingValidated: 1, existingParking: 0, parkingWritten: 0 });
    await expect(importProductionData(parkingRows, "apply", 100, db, false, "parking-only"))
      .resolves.toMatchObject({ parkingWritten: 1, locationsWritten: 0, imagesWritten: 0 });
    expect(db.upsertParking).toHaveBeenCalledWith(parkingRows.parking);
    expect(db.upsertLocations).not.toHaveBeenCalled();
    expect(db.upsertImages).not.toHaveBeenCalled();
  });

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

  it("updates only permit fields for existing locations and never inspects or writes images", async () => {
    const db = database({ findLocationIds: vi.fn(async () => [locationId]) });
    const reviewedRows = rows();
    Object.assign(reviewedRows.locations[0], {
      permit_type: "기관 직접 문의",
      contact_name: "Official desk",
      contact_phone: "02-1234-5678",
      permit_source: "Official filming guide",
      permit_source_url: "https://example.com/permit",
      permit_reference_date: "2026-01-01",
      permit_last_verified_at: "2026-10-03T00:00:00Z",
    });

    await expect(importProductionData(reviewedRows, "apply", 100, db, false, "permit-only")).resolves.toMatchObject({
      writeScope: "permit-only",
      locationsWritten: 1,
      imagesWritten: 0,
    });
    expect(db.findExistingImages).not.toHaveBeenCalled();
    expect(db.upsertLocations).not.toHaveBeenCalled();
    expect(db.upsertImages).not.toHaveBeenCalled();
    expect(db.updateLocationAttribution).not.toHaveBeenCalled();
    expect(db.updateImageAttribution).not.toHaveBeenCalled();
    expect(db.updatePermitMetadata).toHaveBeenCalledWith([{
      id: locationId,
      permit_type: "기관 직접 문의",
      contact_name: "Official desk",
      contact_phone: "02-1234-5678",
      permit_note: "사전 문의",
      permit_source: "Official filming guide",
      permit_source_url: "https://example.com/permit",
      permit_reference_date: "2026-01-01",
      permit_last_verified_at: "2026-10-03T00:00:00Z",
    }]);
  });

  it("does not overwrite an existing location with the generic unreviewed permit fallback", async () => {
    const db = database({ findLocationIds: vi.fn(async () => [locationId]) });
    await expect(importProductionData(rows(), "apply", 100, db, false, "permit-only")).resolves.toMatchObject({
      locationsWritten: 0,
    });
    expect(db.updatePermitMetadata).not.toHaveBeenCalled();
  });

  it("reports permit-only dry-runs without querying image rows", async () => {
    const db = database({ findLocationIds: vi.fn(async () => [locationId]) });
    await expect(importProductionData(rows(), "dry-run", 100, db, false, "permit-only")).resolves.toMatchObject({
      existingLocations: 1,
      existingImages: 0,
      locationsWritten: 0,
      imagesWritten: 0,
    });
    expect(db.findExistingImages).not.toHaveBeenCalled();
  });

  it("rejects insert-only with any partial write scope", async () => {
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
      parking: [],
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
