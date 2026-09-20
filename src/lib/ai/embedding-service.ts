export interface ImageEmbeddingService {
  embed(image: File | Blob, options?: EmbeddingRequestOptions): Promise<number[]>;
  getStatus(): EmbeddingServiceStatus;
  subscribe(listener: EmbeddingStatusListener): () => void;
}

export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
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
