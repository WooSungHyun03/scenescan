import type { ImageEmbeddingService } from "./embedding-service";
import { MockEmbeddingService } from "./mock-embedding-service";
import { TransformersJsEmbeddingService } from "./transformers-js-embedding-service";

export type {
  EmbeddingServiceState,
  EmbeddingServiceStatus,
  EmbeddingStatusListener,
  EmbeddingRequestOptions,
  ImageEmbeddingService,
} from "./embedding-service";
export {
  CLIP_EMBEDDING_DIMENSION,
  CLIP_MODEL_ID,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "./embedding-service";

let service: ImageEmbeddingService | null = null;

export function createImageEmbeddingService(): ImageEmbeddingService {
  service ??= process.env.NEXT_PUBLIC_USE_MOCK_AI !== "false"
    ? new MockEmbeddingService()
    : new TransformersJsEmbeddingService();
  return service;
}
