/**
 * Runtime-neutral CLIP and image-envelope constants.
 *
 * Offline Node scripts import this module instead of embedding-service.ts so
 * validate-only commands never pull browser environment aliases into Node.
 */
export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
export const CLIP_MODEL_REVISION = "main";
export const CLIP_MODEL_DTYPE = "q8";
export const CLIP_EMBEDDING_DIMENSION = 512;
export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 120_000;
export const EMBEDDING_PERFORMANCE_SAMPLE_LIMIT = 20;

export type ClipBrowserDevice = "wasm" | "webgpu";

export function selectClipBrowserDevice(value: string | undefined): ClipBrowserDevice {
  return value === "webgpu" ? "webgpu" : "wasm";
}
