import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildLocationDataset,
  parseCollectionManifest,
  parseCommonsImageInfo,
  stripMarkup,
  reusableImage,
  assertUniqueImageContent,
} from "./collect-commons.ts";

const locationId = "00000000-0000-4000-8000-000000000001";
const imageId = "00000000-0000-4000-8000-000000000002";

function manifest() {
  return {
    schema_version: 1,
    verified_at: "2026-09-29T00:00:00+09:00",
    public_base_url: "https://beceleb.org/locations",
    attribution_url: "https://example.com/licenses",
    locations: [{
      id: locationId,
      slug: "test-location",
      name: "테스트 장소",
      description: "설명",
      category: "urban",
      region: "서울",
      address: "서울특별시 테스트로 1",
      latitude: 37.5,
      longitude: 127,
      source: "공식 출처",
      source_url: "https://example.com/location",
      images: [{ id: imageId, file_title: "File:Test.jpg", filename: "test-location-01.jpg", alt: "대체 텍스트" }],
    }],
  } as const;
}

function imageInfo(license = "CC BY-SA 4.0", restrictions = "") {
  return {
    url: "https://upload.wikimedia.org/original.jpg",
    descriptionurl: "https://commons.wikimedia.org/wiki/File:Test.jpg",
    thumburl: "https://upload.wikimedia.org/thumb.jpg",
    mime: "image/jpeg",
    width: 2048,
    height: 1365,
    sha1: "abc123",
    extmetadata: {
      Artist: { value: "<a>Test &amp; Author</a>" },
      Credit: { value: "Own work" },
      LicenseShortName: { value: license },
      LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
      Restrictions: { value: restrictions },
    },
  };
}

describe("Commons production data collection", () => {
  it("reuses only a complete checksum-matching image with the current source revision", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0, 0xff, 0xd9]);
    const details = parseCommonsImageInfo("File:Test.jpg", imageInfo());
    const cached = { image_id: imageId, source_sha1: details.sourceSha1,
      local_sha256: createHash("sha256").update(bytes).digest("hex"), downloaded_thumbnail_url: details.thumbnailUrl };
    expect(reusableImage(bytes, details, cached)?.bytes).toBe(5);
    expect(reusableImage(bytes, details, { ...cached, source_sha1: "changed" })).toBeNull();
    expect(reusableImage(Buffer.from([0]), details, cached)).toBeNull();
    expect(reusableImage(Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9]), details, cached)).toBeNull();
    expect(reusableImage(bytes, details, undefined)).toBeNull();
  });

  it("rejects identical source content under different Commons titles", () => {
    const details = parseCommonsImageInfo("File:Test.jpg", imageInfo());
    expect(() => assertUniqueImageContent(new Map([["first", details], ["second", details]]))).toThrow("Duplicate Commons image content");
  });
  it("sanitizes attribution markup and accepts the allowlisted license", () => {
    expect(stripMarkup("<span>A &amp; B</span>")).toBe("A & B");
    const result = parseCommonsImageInfo("File:Test.jpg", imageInfo());
    expect(result.artist).toBe("Test & Author");
    expect(result.license).toBe("CC BY-SA 4.0");
    expect(parseCommonsImageInfo("File:Test.jpg", imageInfo("CC BY-SA 2.0")).license).toBe("CC BY-SA 2.0");
    expect(parseCommonsImageInfo("File:Test.jpg", imageInfo("Public domain")).license).toBe("Public domain");
  });

  it("rejects unapproved licenses and additional restrictions", () => {
    expect(() => parseCommonsImageInfo("File:Test.jpg", imageInfo("GPL 3.0"))).toThrow("unapproved license");
    expect(() => parseCommonsImageInfo("File:Test.jpg", imageInfo("CC BY 4.0", "personality rights"))).toThrow("additional restrictions");
  });

  it("rejects duplicate image IDs", () => {
    const input = manifest();
    const duplicate = JSON.parse(JSON.stringify(input)) as {
      locations: Array<{ images: Array<{ id: string; file_title: string; filename: string; alt: string }> }>;
    };
    duplicate.locations[0].images.push({ ...duplicate.locations[0].images[0], filename: "test-location-02.jpg" });
    expect(() => parseCollectionManifest(duplicate)).toThrow("Duplicate image id");
  });

  it("builds canonical paths, attribution, and conservative permit guidance", () => {
    const parsed = parseCollectionManifest(manifest());
    const output = buildLocationDataset(parsed);
    expect(output.locations[0]).toMatchObject({
      id: locationId,
      sourceUrl: "https://example.com/location",
      permit: { type: "문의 필요", contactName: null, contactPhone: null },
      images: [{
        imagePath: "public/locations/test-location-01.jpg",
        imageUrl: "https://beceleb.org/locations/test-location-01.jpg",
      }],
    });
  });

  it("passes a confirmed Busan district through to the canonical dataset", () => {
    const input = JSON.parse(JSON.stringify(manifest())) as Record<string, unknown> & {
      locations: Array<Record<string, unknown>>;
    };
    input.locations[0].region = "부산";
    input.locations[0].district = "busan_haeundae_gu";
    const output = buildLocationDataset(parseCollectionManifest(input));
    expect(output.locations[0].district).toBe("busan_haeundae_gu");
  });

  it("passes evidence-backed aliases/tags through, and defaults to empty arrays when omitted", () => {
    const input = JSON.parse(JSON.stringify(manifest())) as Record<string, unknown> & {
      locations: Array<Record<string, unknown>>;
    };
    input.locations[0].tags = ["박물관"];
    const output = buildLocationDataset(parseCollectionManifest(input));
    expect(output.locations[0].tags).toEqual(["박물관"]);
    expect(output.locations[0].aliases).toEqual([]);
  });

  it("defaults district to null when the manifest omits it", () => {
    const output = buildLocationDataset(parseCollectionManifest(manifest()));
    expect(output.locations[0].district).toBeNull();
  });

  it("rejects a district set on a non-Busan location at the manifest level", () => {
    const input = JSON.parse(JSON.stringify(manifest())) as Record<string, unknown> & {
      locations: Array<Record<string, unknown>>;
    };
    input.locations[0].district = "busan_haeundae_gu";
    expect(() => parseCollectionManifest(input)).toThrow(/부산/);
  });

  it("rejects a district value outside the 1차 single definition at the manifest level", () => {
    const input = JSON.parse(JSON.stringify(manifest())) as Record<string, unknown> & {
      locations: Array<Record<string, unknown>>;
    };
    input.locations[0].region = "부산";
    input.locations[0].district = "해운대구";
    expect(() => parseCollectionManifest(input)).toThrow();
  });

  it("preserves reviewed permit contact and provenance instead of replacing it with the fallback", () => {
    const input = JSON.parse(JSON.stringify(manifest())) as Record<string, unknown> & {
      locations: Array<Record<string, unknown>>;
    };
    input.locations[0].permit = {
      type: "기관 직접 문의",
      contact_name: "공식 담당 부서",
      contact_phone: "02-1234-5678",
      note: "시설별 조건을 확인하세요.",
      source: "공식 촬영 안내",
      source_url: "https://example.com/permit",
      reference_date: "2026-01-01",
      last_verified_at: "2026-10-03T12:00:00+09:00",
    };

    const output = buildLocationDataset(parseCollectionManifest(input));
    expect(output.locations[0].permit).toEqual({
      type: "기관 직접 문의",
      contactName: "공식 담당 부서",
      contactPhone: "02-1234-5678",
      note: "시설별 조건을 확인하세요.",
      provenance: {
        source: "공식 촬영 안내",
        sourceUrl: "https://example.com/permit",
        referenceDate: "2026-01-01",
        lastVerifiedAt: "2026-10-03T12:00:00+09:00",
      },
    });
  });

  it("rejects a reviewed permit entry with a malformed phone number", () => {
    const input = JSON.parse(JSON.stringify(manifest())) as Record<string, unknown> & {
      locations: Array<Record<string, unknown>>;
    };
    input.locations[0].permit = {
      type: "기관 직접 문의",
      contact_name: "공식 담당 부서",
      contact_phone: "담당자에게 문의",
      note: "시설별 조건을 확인하세요.",
      source: "공식 촬영 안내",
      source_url: "https://example.com/permit",
      reference_date: null,
      last_verified_at: "2026-10-03T12:00:00+09:00",
    };
    expect(() => parseCollectionManifest(input)).toThrow("Invalid public phone number");
  });
});
