import { describe, expect, it, vi } from "vitest";
import { validateLocationDataset, type DataValidationErrorCode } from "./validator.ts";

const locationId = "00000000-0000-4000-8000-000000000101";

function validLocation() {
  const provenance = {
    source: "Authorized source",
    sourceUrl: "https://example.com/locations/1",
    referenceDate: "2026-09-01",
    lastVerifiedAt: "2026-09-20T00:00:00Z",
  };
  return {
    id: locationId,
    name: "Sample location",
    description: "Authorized sample",
    category: "urban",
    region: "서울",
    address: "1 Example-ro",
    latitude: 37.55,
    longitude: 126.97,
    permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null, provenance },
    parking: [{
      id: "parking-1",
      name: "Example parking",
      latitude: 37.551,
      longitude: 126.971,
      capacity: 20,
      openingHours: null,
      priceInfo: null,
      provenance: { ...provenance, sourceUrl: "https://example.com/parking/1" },
    }],
    images: [{
      imagePath: "images/location.jpg",
      imageUrl: "https://example.com/location.jpg",
      alt: "Sample location exterior",
    }],
    sourceUrl: "https://example.com/locations/1",
    provenance,
  };
}

function dataset(locations: unknown[]) {
  return { schemaVersion: 2, source: { name: "authorized-source" }, locations };
}

describe("validateLocationDataset", () => {
  it("accepts an import-ready canonical dataset", async () => {
    const inspectImagePath = vi.fn(async () => "ok" as const);

    await expect(validateLocationDataset(dataset([validLocation()]), { inspectImagePath }))
      .resolves.toEqual({
        schemaVersion: 1,
        valid: true,
        summary: { totalLocations: 1, validLocations: 1, invalidLocations: 0, errorCount: 0 },
        errors: [],
      });
    expect(inspectImagePath).toHaveBeenCalledWith("images/location.jpg");
  });

  it("collects duplicate IDs, required-field, coordinate, category, and image-path errors", async () => {
    const first = validLocation();
    const second = {
      ...validLocation(),
      name: "   ",
      category: "unknown",
      latitude: 91,
      longitude: "126.97",
      images: [{
        imagePath: "images/directory",
        imageUrl: "https://example.com/two.jpg",
        alt: "Second image",
      }],
    };
    const report = await validateLocationDataset(dataset([first, second]), {
      inspectImagePath: async (path) => path.endsWith("directory") ? "not-file" : "missing",
    });
    const codes = report.errors.map((item) => item.code);

    expect(report.valid).toBe(false);
    expect(report.summary).toEqual({ totalLocations: 2, validLocations: 0, invalidLocations: 2, errorCount: 8 });
    expect(codes.filter((code) => code === "LOCATION_ID_DUPLICATE")).toHaveLength(2);
    expect(codes).toEqual(expect.arrayContaining<DataValidationErrorCode>([
      "NAME_REQUIRED",
      "CATEGORY_UNKNOWN",
      "LATITUDE_INVALID",
      "LONGITUDE_INVALID",
      "IMAGE_PATH_NOT_FOUND",
      "IMAGE_PATH_NOT_FILE",
    ]));
  });

  it("reports missing IDs and images without trying to inspect a path", async () => {
    const inspectImagePath = vi.fn(async () => "ok" as const);
    const location = { ...validLocation(), id: undefined, images: [] };
    const report = await validateLocationDataset(dataset([location]), { inspectImagePath });

    expect(report.errors.map((item) => item.code)).toEqual(["LOCATION_ID_REQUIRED", "IMAGES_REQUIRED"]);
    expect(inspectImagePath).not.toHaveBeenCalled();
  });

  it("returns a deterministic root-level report for an invalid dataset", async () => {
    const report = await validateLocationDataset([], { inspectImagePath: async () => "ok" });

    expect(report).toEqual({
      schemaVersion: 1,
      valid: false,
      summary: { totalLocations: 0, validLocations: 0, invalidLocations: 0, errorCount: 1 },
      errors: [{
        code: "DATASET_INVALID",
        locationIndex: null,
        locationId: null,
        field: "$",
        message: "Dataset must be an object",
      }],
    });
  });

  it("blocks import while category review items remain", async () => {
    const input = {
      ...dataset([validLocation()]),
      reviewQueue: [{ recordIndex: 1, sourceCategory: "mixed-use", reason: "UNKNOWN_CATEGORY" }],
    };
    const report = await validateLocationDataset(input, { inspectImagePath: async () => "ok" });

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual({
      code: "CATEGORY_REVIEW_REQUIRED",
      locationIndex: null,
      locationId: null,
      field: "reviewQueue",
      message: "1 source record(s) require category review before import",
    });
  });

  it("rejects decisive permit text and generated contact fallbacks", async () => {
    const location = {
      ...validLocation(),
      permit: {
        ...validLocation().permit,
        type: "허가 가능",
        contactName: "   ",
        contactPhone: undefined,
      },
    };
    const report = await validateLocationDataset(dataset([location]), { inspectImagePath: async () => "ok" });

    expect(report.errors.map((item) => item.code)).toEqual([
      "PERMIT_CONTACT_INVALID",
      "PERMIT_CONTACT_INVALID",
      "PERMIT_GUIDANCE_UNSAFE",
    ]);
  });

  it("reports missing and malformed provenance for location, permit, and parking", async () => {
    const location = {
      ...validLocation(),
      provenance: undefined,
      permit: { ...validLocation().permit, provenance: { source: "", sourceUrl: "not-a-url" } },
      parking: [{
        ...validLocation().parking[0],
        provenance: {
          source: "Parking API",
          sourceUrl: "https://example.com/parking/1",
          referenceDate: "2026-02-30",
          lastVerifiedAt: "yesterday",
        },
      }],
    };
    const report = await validateLocationDataset(dataset([location]), { inspectImagePath: async () => "ok" });

    expect(report.errors.map((item) => item.field)).toEqual([
      "parking[0].provenance.lastVerifiedAt",
      "parking[0].provenance.referenceDate",
      "permit.provenance.lastVerifiedAt",
      "permit.provenance.referenceDate",
      "permit.provenance.source",
      "permit.provenance.sourceUrl",
      "provenance",
    ]);
    expect(report.errors.every((item) => item.code === "PROVENANCE_INVALID")).toBe(true);
  });
});
