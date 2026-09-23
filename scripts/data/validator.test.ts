import { describe, expect, it, vi } from "vitest";
import { validateLocationDataset, type DataValidationErrorCode } from "./validator.ts";

const locationId = "00000000-0000-4000-8000-000000000101";

function validLocation() {
  return {
    id: locationId,
    name: "Sample location",
    description: "Authorized sample",
    category: "urban",
    region: "서울",
    address: "1 Example-ro",
    latitude: 37.55,
    longitude: 126.97,
    permit: { type: "Contact first", contactName: null, contactPhone: null, note: null },
    images: [{
      imagePath: "images/location.jpg",
      imageUrl: "https://example.com/location.jpg",
      alt: "Sample location exterior",
    }],
    sourceUrl: "https://example.com/locations/1",
  };
}

function dataset(locations: unknown[]) {
  return { schemaVersion: 1, source: { name: "authorized-source" }, locations };
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
});
