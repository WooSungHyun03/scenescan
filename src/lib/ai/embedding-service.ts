import { publicEnv } from "@/env/public";
import {
  selectClipBrowserDevice,
  type ClipBrowserDevice,
} from "./embedding-config";

export {
  CLIP_EMBEDDING_DIMENSION,
  CLIP_MODEL_DTYPE,
  CLIP_MODEL_ID,
  CLIP_MODEL_REVISION,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  EMBEDDING_PERFORMANCE_SAMPLE_LIMIT,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  SUPPORTED_IMAGE_MIME_TYPES,
  selectClipBrowserDevice,
} from "./embedding-config";
export type { ClipBrowserDevice } from "./embedding-config";

export interface ImageEmbeddingService {
  embed(image: File | Blob, options?: EmbeddingRequestOptions): Promise<number[]>;
  getStatus(): EmbeddingServiceStatus;
  getPerformanceSnapshot(): readonly EmbeddingPerformanceSample[];
  subscribe(listener: EmbeddingStatusListener): () => void;
}

export const CLIP_BROWSER_DEVICE = selectClipBrowserDevice(publicEnv.clipDevice);

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
