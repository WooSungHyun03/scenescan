import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "./embedding-service";

export function validateImageBlob(image: Blob): void {
  if (image.size === 0) throw new Error("Image file is empty");
  if (image.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`);
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(
    image.type as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number],
  )) {
    throw new Error(
      `Unsupported image type: ${image.type || "unknown"}. Use JPEG, PNG, or WebP`,
    );
  }
}

export function validateImageDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Decoded image has invalid dimensions");
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`Image dimensions exceed ${MAX_IMAGE_DIMENSION} px`);
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_PIXELS / 1_000_000} megapixel limit`);
  }
}
