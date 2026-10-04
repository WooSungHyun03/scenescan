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
      relationship: "nearby",
      name: "Example parking",
      latitude: 37.551,
      longitude: 126.971,
      capacity: 20,
      openingHours: null,
      priceInfo: null,
      provenance: { ...provenance, sourceUrl: "https://example.com/parking/1" },
    }],
    noiseSources: [],
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

    await expect(validateLocationDataset(dataset([validLocation()]), {
      mode: "require-local-assets",
      inspectImagePath,
    }))
      .resolves.toEqual({
        schemaVersion: 2,
        mode: "require-local-assets",
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
      mode: "require-local-assets",
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
    const report = await validateLocationDataset(dataset([location]), {
      mode: "require-local-assets",
      inspectImagePath,
    });

    expect(report.errors.map((item) => item.code)).toEqual(["LOCATION_ID_REQUIRED", "IMAGES_REQUIRED"]);
    expect(inspectImagePath).not.toHaveBeenCalled();
  });

  it("returns a deterministic root-level report for an invalid dataset", async () => {
    const report = await validateLocationDataset([], {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
    });

    expect(report).toEqual({
      schemaVersion: 2,
      mode: "require-local-assets",
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
    const report = await validateLocationDataset(input, {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
    });

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
    const report = await validateLocationDataset(dataset([location]), {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
    });

    expect(report.errors.map((item) => item.code)).toEqual([
      "PERMIT_CONTACT_INVALID",
      "PERMIT_CONTACT_INVALID",
      "PERMIT_GUIDANCE_UNSAFE",
    ]);
  });

  it("rejects malformed permit phone numbers without inventing a replacement", async () => {
    const location = {
      ...validLocation(),
      permit: { ...validLocation().permit, contactPhone: "담당자에게 문의" },
    };
    const report = await validateLocationDataset(dataset([location]), {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
    });

    expect(report.errors).toContainEqual(expect.objectContaining({
      code: "PERMIT_CONTACT_INVALID",
      field: "permit.contactPhone",
    }));
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
    const report = await validateLocationDataset(dataset([location]), {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
    });

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

  it("rejects duplicate parking name and coordinates within one location", async () => {
    const location = validLocation();
    location.parking.push({ ...location.parking[0], id: "parking-2" });
    const report = await validateLocationDataset(dataset([location]), {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
    });

    expect(report.errors.filter((item) => item.code === "PARKING_DUPLICATE")).toEqual([
      expect.objectContaining({ field: "parking[0]" }),
      expect.objectContaining({ field: "parking[1]" }),
    ]);
  });

  it("rejects malformed, stale, and duplicate expected noise-source metadata", async () => {
    const source = {
      kind: "railway",
      description: "인근 지상 철도",
      distanceMeters: 120,
      evidence: "railway=rail",
      license: "ODbL 1.0",
      licenseUrl: "https://www.openstreetmap.org/copyright",
      provenance: {
        source: "© OpenStreetMap contributors",
        sourceUrl: "https://www.openstreetmap.org/way/1",
        referenceDate: "2024-01-01",
        lastVerifiedAt: "2024-01-01T00:00:00Z",
      },
    };
    const location = {
      ...validLocation(),
      noiseSources: [source, { ...source, description: "중복" }, {
        ...source,
        provenance: { ...source.provenance, sourceUrl: "javascript:alert(1)", lastVerifiedAt: "invalid" },
      }],
    };
    const report = await validateLocationDataset(dataset([location]), {
      mode: "require-local-assets",
      inspectImagePath: async () => "ok",
      now: new Date("2026-10-04T00:00:00Z"),
    });

    expect(report.errors.map((item) => item.code)).toEqual(expect.arrayContaining<DataValidationErrorCode>([
      "NOISE_SOURCE_STALE",
      "NOISE_SOURCE_DUPLICATE",
      "NOISE_SOURCE_INVALID",
      "PROVENANCE_INVALID",
    ]));
  });

  it("metadata-only validates paths as metadata without touching local files", async () => {
    const inspectImagePath = vi.fn(async () => "missing" as const);

    const report = await validateLocationDataset(dataset([validLocation()]), {
      mode: "metadata-only",
      inspectImagePath,
    });

    expect(report.valid).toBe(true);
    expect(report.mode).toBe("metadata-only");
    expect(inspectImagePath).not.toHaveBeenCalled();
  });

  it("metadata-only joins every production image to reviewed license metadata", async () => {
    const imageId = "00000000-0000-4000-8000-000000000201";
    const embeddingManifest = {
      schema_version: 1,
      items: [{
        image_id: imageId,
        location_id: locationId,
        image_path: "../../public/locations/location.jpg",
        image_url: "https://example.com/location.jpg",
        source: "Wikimedia Commons",
        source_url: "https://commons.wikimedia.org/wiki/File:Location.jpg",
      }],
    };
    const imageLicenses = {
      schema_version: 1,
      verified_at: "2026-10-03T00:00:00Z",
      items: [{
        image_id: imageId,
        location_id: locationId,
        commons_page_url: "https://commons.wikimedia.org/wiki/File:Location.jpg",
        author: "Photographer",
        license: "CC BY 4.0",
        license_url: "https://creativecommons.org/licenses/by/4.0",
        filename: "location.jpg",
        local_sha256: "a".repeat(64),
        local_bytes: 123,
      }],
    };

    await expect(validateLocationDataset(dataset([validLocation()]), {
      mode: "metadata-only",
      embeddingManifest,
      imageLicenses,
    })).resolves.toMatchObject({ valid: true, mode: "metadata-only", errors: [] });

    const changedBytes = await validateLocationDataset(dataset([validLocation()]), {
      mode: "require-local-assets",
      embeddingManifest,
      imageLicenses,
      inspectImagePath: async () => ({
        status: "ok",
        bytes: 124,
        sha256: "b".repeat(64),
      }),
    });
    expect(changedBytes.errors.map((item) => item.code)).toEqual(expect.arrayContaining([
      "IMAGE_SIZE_MISMATCH",
      "IMAGE_CHECKSUM_MISMATCH",
    ]));

    imageLicenses.items[0].license = "";
    const invalid = await validateLocationDataset(dataset([validLocation()]), {
      mode: "metadata-only",
      embeddingManifest,
      imageLicenses,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((item) => item.code)).toContain("LICENSE_MANIFEST_INVALID");
  });
});
