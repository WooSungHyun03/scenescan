import { describe, expect, it } from "vitest";
import { parseManifest } from "../embeddings/contracts.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import { buildStoragePlan, isIdenticalStoredJpeg } from "./storage-uploader.ts";
import { createHash } from "node:crypto";

const locationId = "00000000-0000-4000-8000-000000000001";
const imageId = "00000000-0000-4000-8000-000000000002";

describe("Supabase Storage upload planning", () => {
  it("skips only a byte-identical JPEG, not a same-size replacement", () => {
    const bytes = Buffer.from("original");
    const stored = { size: bytes.length, contentType: "image/jpeg", etag: `"${createHash("md5").update(bytes).digest("hex")}"` };
    expect(isIdenticalStoredJpeg(bytes, stored)).toBe(true);
    expect(isIdenticalStoredJpeg(Buffer.from("modified"), stored)).toBe(false);
    expect(isIdenticalStoredJpeg(bytes, { ...stored, contentType: "image/png" })).toBe(false);
    expect(isIdenticalStoredJpeg(bytes, { ...stored, etag: "multipart-2" })).toBe(false);
  });
  it("rewrites runtime and embedding URLs to stable public object URLs", () => {
    const previousUrl = "https://beceleb.org/locations/test.jpg";
    const dataset = parseNormalizedLocationOutput({
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
        permit: { type: "문의 필요", contactName: null, contactPhone: null, note: null, provenance: { source: "test", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null } },
        parking: [],
        images: [{ imagePath: "../../public/locations/test.jpg", imageUrl: previousUrl, alt: "테스트" }],
        sourceUrl: "https://example.com",
        provenance: { source: "test", sourceUrl: "https://example.com", referenceDate: null, lastVerifiedAt: null },
      }],
      reviewQueue: [],
    });
    const manifest = parseManifest({
      schema_version: 1,
      items: [{ image_id: imageId, location_id: locationId, image_path: "../../public/locations/test.jpg", image_url: previousUrl, source: "test", source_url: "https://example.com" }],
    });
    const plan = buildStoragePlan(dataset, manifest, "/repo/data/production/manifest.json", "https://project.supabase.co", "location-images", "/repo/data/production/storage");
    const expected = `https://project.supabase.co/storage/v1/object/public/location-images/${locationId}/${imageId}.jpg`;
    expect(plan.items[0]).toMatchObject({ objectPath: `${locationId}/${imageId}.jpg`, publicUrl: expected });
    expect(plan.dataset.locations[0].images[0].imageUrl).toBe(expected);
    expect(plan.manifest.items[0].image_url).toBe(expected);
    expect(plan.manifest.items[0].image_path).toBe("../../../public/locations/test.jpg");
  });
});
