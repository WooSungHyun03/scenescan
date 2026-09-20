import type { ImageEmbeddingService } from "./embedding-service";
import { MockEmbeddingService } from "./mock-embedding-service";
import { TransformersJsEmbeddingService } from "./transformers-js-embedding-service";

export function createImageEmbeddingService(): ImageEmbeddingService {
  return process.env.NEXT_PUBLIC_USE_MOCK_AI !== "false"
    ? new MockEmbeddingService()
    : new TransformersJsEmbeddingService();
}
