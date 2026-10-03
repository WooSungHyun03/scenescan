export interface ImageEmbeddingService {
  embed(image: File | Blob, options?: EmbeddingRequestOptions): Promise<number[]>;
  getStatus(): EmbeddingServiceStatus;
  getPerformanceSnapshot(): readonly EmbeddingPerformanceSample[];
  subscribe(listener: EmbeddingStatusListener): () => void;
}

export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
export const CLIP_MODEL_REVISION = "main";
// Pin precision across browser and offline runtimes. Device defaults differ.
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

export const CLIP_BROWSER_DEVICE = selectClipBrowserDevice(process.env.NEXT_PUBLIC_CLIP_DEVICE);

export type EmbeddingPerformanceSample = {
  requestId: number;
  totalMs: number;
  workerMs: number;
  transferAndQueueMs: number;
  decodeMs: number;
  modelWaitMs: number;
  queueWaitMs: number;
  inferenceMs: number;
  modelWasCached: boolean;
  device: ClipBrowserDevice;
};

export type EmbeddingRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type EmbeddingServiceState = "idle" | "loading" | "ready" | "error";

export type EmbeddingServiceStatus = {
  state: EmbeddingServiceState;
  error?: string;
  progress?: number;
};

export type EmbeddingStatusListener = (status: EmbeddingServiceStatus) => void;
