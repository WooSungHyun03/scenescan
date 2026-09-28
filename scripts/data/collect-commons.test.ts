import { describe, expect, it } from "vitest";
import {
  buildLocationDataset,
  parseCollectionManifest,
  parseCommonsImageInfo,
  stripMarkup,
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
  it("sanitizes attribution markup and accepts the allowlisted license", () => {
    expect(stripMarkup("<span>A &amp; B</span>")).toBe("A & B");
    const result = parseCommonsImageInfo("File:Test.jpg", imageInfo());
    expect(result.artist).toBe("Test & Author");
    expect(result.license).toBe("CC BY-SA 4.0");
  });

  it("rejects unapproved licenses and additional restrictions", () => {
    expect(() => parseCommonsImageInfo("File:Test.jpg", imageInfo("Public domain"))).toThrow("unapproved license");
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
      sourceUrl: "https://example.com/licenses",
      permit: { type: "문의 필요", contactName: null, contactPhone: null },
      images: [{
        imagePath: "public/locations/test-location-01.jpg",
        imageUrl: "https://beceleb.org/locations/test-location-01.jpg",
      }],
    });
  });
});
