import { describe, expect, it } from "vitest";
import { parseManifest } from "../embeddings/contracts.ts";
import { parseNormalizedLocationOutput } from "./contracts.ts";
import {
  buildStoragePlan,
  isIdenticalStoredJpeg,
  validateStoragePlanLocalAssets,
} from "./storage-uploader.ts";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("fails closed without downloading a missing local asset", async () => {
    await expect(validateStoragePlanLocalAssets([{
      imageId,
      locationId,
      localPath: "/definitely-missing/scenescan.jpg",
      objectPath: `${locationId}/${imageId}.jpg`,
      previousUrl: "https://example.com/old.jpg",
      publicUrl: "https://example.com/new.jpg",
    }])).rejects.toThrow("uploader never downloads source images automatically");
  });

  it("compares local bytes with the reviewed license checksum before upload", async () => {
    const root = await mkdtemp(join(tmpdir(), "scenescan-storage-assets-"));
    try {
      const localPath = join(root, "test.jpg");
      const bytes = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
      await writeFile(localPath, bytes);
      const item = {
        imageId,
        locationId,
        localPath,
        objectPath: `${locationId}/${imageId}.jpg`,
        previousUrl: "https://example.com/old.jpg",
        publicUrl: "https://example.com/new.jpg",
      };
      const expected = new Map([[imageId, {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }]]);

      await expect(validateStoragePlanLocalAssets([item], 1, expected))
        .resolves.toEqual({ files: 1, bytes: bytes.length });
      expected.set(imageId, { bytes: bytes.length, sha256: "0".repeat(64) });
      await expect(validateStoragePlanLocalAssets([item], 1, expected))
        .rejects.toThrow("SHA-256 differs");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
