import { describe, expect, it } from "vitest";
import type { LocationImage } from "@/types/domain";
import {
  getAvailableGalleryImages,
  getSafeImageUrl,
  getSelectedGalleryImage,
} from "./location-image-gallery";

function image(id: string, imageUrl: string, author: string): LocationImage {
  return {
    id,
    locationId: "location-1",
    imageUrl,
    alt: `${id} alt`,
    source: "Wikimedia Commons",
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
    author,
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    lastVerifiedAt: "2026-09-29T13:00:00+09:00",
  };
}

describe("location image gallery attribution", () => {
  it("accepts local and HTTP images while dropping unsafe image URLs", () => {
    expect(getSafeImageUrl("/images/demo.svg")).toBe("/images/demo.svg");
    expect(getSafeImageUrl("https://images.example/test.jpg")).toBe("https://images.example/test.jpg");
    expect(getSafeImageUrl("//images.example/test.jpg")).toBeNull();
    expect(getSafeImageUrl("javascript:alert(1)")).toBeNull();
  });

  it("returns the selected image together with its own attribution", () => {
    const images = getAvailableGalleryImages([
      image("first", "/images/first.svg", "First Author"),
      image("second", "/images/second.svg", "Second Author"),
      image("unsafe", "data:image/png;base64,abc", "Unsafe Author"),
    ]);

    expect(images).toHaveLength(2);
    expect(getSelectedGalleryImage(images, "second")).toMatchObject({
      id: "second",
      author: "Second Author",
    });
    expect(getSelectedGalleryImage(images, "missing")?.id).toBe("first");
  });
});
