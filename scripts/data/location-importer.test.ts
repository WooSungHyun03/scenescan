import { describe, expect, it, vi } from "vitest";
import { buildImportRows, importLocationDataset, type LocationImportDatabase } from "./location-importer.ts";
import type { CanonicalLocationRecord } from "./contracts.ts";

function record(overrides: Partial<CanonicalLocationRecord> = {}): CanonicalLocationRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "테스트 장소",
    description: "설명",
    category: "urban",
    region: "서울",
    address: "주소",
    latitude: 37.5,
    longitude: 127.0,
    permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null, provenance: provenance() },
    parking: [],
    images: [{ imageUrl: "https://example.com/a.jpg", alt: "설명" }],
    sourceUrl: "https://example.com/source",
    provenance: provenance(),
    ...overrides,
  };
}

function provenance() {
  return { source: "kofic", sourceUrl: "https://example.com/source", referenceDate: "2026-09-01", lastVerifiedAt: "2026-09-20T00:00:00Z" };
}

function fakeDatabase(overrides: Partial<LocationImportDatabase> = {}): LocationImportDatabase & { upsertLocationsMock: ReturnType<typeof vi.fn>; upsertParkingMock: ReturnType<typeof vi.fn> } {
  const upsertLocationsMock = vi.fn().mockResolvedValue(undefined);
  const upsertParkingMock = vi.fn().mockResolvedValue(undefined);
  return {
    findExistingLocationIds: async () => [],
    findExistingParkingKeys: async () => [],
    upsertLocations: upsertLocationsMock,
    upsertParking: upsertParkingMock,
    upsertLocationsMock,
    upsertParkingMock,
    ...overrides,
  };
}

describe("buildImportRows", () => {
  it("maps a canonical record with parking into locations + parking rows", () => {
    const { locationRows, parkingRows } = buildImportRows([
      record({
        parking: [{ relationship: "nearby", name: "A 주차장", latitude: 37.5, longitude: 127.0, capacity: 3, openingHours: "09-18", priceInfo: "무료", provenance: provenance() }],
      }),
    ]);
    expect(locationRows).toEqual([{
      id: "11111111-1111-4111-8111-111111111111", name: "테스트 장소", description: "설명", category: "urban", region: "서울",
      address: "주소", latitude: 37.5, longitude: 127.0, permit_type: "문의 필요", contact_name: null, contact_phone: null, permit_note: null,
      permit_source: "kofic", permit_source_url: "https://example.com/source", permit_reference_date: "2026-09-01", permit_last_verified_at: "2026-09-20T00:00:00Z",
      source_url: "https://example.com/source", import_batch: "kofic", reference_date: "2026-09-01", last_verified_at: "2026-09-20T00:00:00Z",
    }]);
    expect(parkingRows).toEqual([{
      location_id: "11111111-1111-4111-8111-111111111111", relationship: "nearby", name: "A 주차장", latitude: 37.5, longitude: 127.0,
      capacity: 3, opening_hours: "09-18", price_info: "무료", source: "kofic", source_url: "https://example.com/source", reference_date: "2026-09-01", last_verified_at: "2026-09-20T00:00:00Z",
    }]);
  });

  it("throws for a record with no id -- an unvalidated record should never reach this stage", () => {
    expect(() => buildImportRows([record({ id: undefined })])).toThrow(/no id/);
  });

  it("throws on a duplicate id within one batch", () => {
    expect(() => buildImportRows([record(), record()])).toThrow(/Duplicate location id/);
  });
});

describe("importLocationDataset", () => {
  it("validate-only never touches the database and requires none", async () => {
    const result = await importLocationDataset([record()], "validate-only", 100);
    expect(result).toEqual({
      mode: "validate-only",
      locations: { validated: 1, existing: 0, toInsert: 1, written: 0 },
      parking: { validated: 0, existing: 0, toInsert: 0, written: 0 },
    });
  });

  it("dry-run reports expected insert/update counts without writing", async () => {
    const database = fakeDatabase({
      findExistingLocationIds: async () => ["11111111-1111-4111-8111-111111111111"],
      findExistingParkingKeys: async () => [{ location_id: "11111111-1111-4111-8111-111111111111", name: "A 주차장" }],
    });
    const result = await importLocationDataset(
      [record({ parking: [{ relationship: "nearby", name: "A 주차장", latitude: 1, longitude: 1, capacity: null, openingHours: null, priceInfo: null, provenance: provenance() }] })],
      "dry-run",
      100,
      database,
    );
    expect(result.locations).toEqual({ validated: 1, existing: 1, toInsert: 0, written: 0 });
    expect(result.parking).toEqual({ validated: 1, existing: 1, toInsert: 0, written: 0 });
    expect(database.upsertLocationsMock).not.toHaveBeenCalled();
    expect(database.upsertParkingMock).not.toHaveBeenCalled();
  });

  it("apply upserts locations before parking (FK order) and reports written counts", async () => {
    const calls: string[] = [];
    const database = fakeDatabase();
    database.upsertLocations = async (rows) => { calls.push("locations"); database.upsertLocationsMock(rows); };
    database.upsertParking = async (rows) => { calls.push("parking"); database.upsertParkingMock(rows); };
    const result = await importLocationDataset(
      [record({ parking: [{ relationship: "nearby", name: "A 주차장", latitude: 1, longitude: 1, capacity: null, openingHours: null, priceInfo: null, provenance: provenance() }] })],
      "apply",
      100,
      database,
    );
    expect(calls).toEqual(["locations", "parking"]);
    expect(result.locations.written).toBe(1);
    expect(result.parking.written).toBe(1);
  });

  it("apply requires a database connection", async () => {
    await expect(importLocationDataset([record()], "apply", 100)).rejects.toThrow(/Database connection/);
  });

  it("idempotent: running apply twice with the same input does not grow the written count per run (upsert semantics delegated to the database layer, exercised for real in the report for this change)", async () => {
    const database = fakeDatabase();
    const first = await importLocationDataset([record()], "apply", 100, database);
    const second = await importLocationDataset([record()], "apply", 100, database);
    expect(first.locations.written).toBe(1);
    expect(second.locations.written).toBe(1);
    expect(database.upsertLocationsMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a batch size outside [1, 500]", async () => {
    await expect(importLocationDataset([record()], "validate-only", 0)).rejects.toThrow();
    await expect(importLocationDataset([record()], "validate-only", 501)).rejects.toThrow();
  });
});
