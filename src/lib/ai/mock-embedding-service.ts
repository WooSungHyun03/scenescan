import type {
  EmbeddingServiceStatus,
  EmbeddingStatusListener,
  EmbeddingRequestOptions,
  ImageEmbeddingService,
} from "./embedding-service";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";
import { validateImageBlob } from "./image-validation";

export class MockEmbeddingService implements ImageEmbeddingService {
  getStatus(): EmbeddingServiceStatus {
    return { state: "ready" };
  }

  subscribe(listener: EmbeddingStatusListener): () => void {
    listener(this.getStatus());
    return () => undefined;
  }

  async embed(image: File | Blob, options: EmbeddingRequestOptions = {}): Promise<number[]> {
    validateImageBlob(image);
    if (options.signal?.aborted) throw new DOMException("Embedding cancelled", "AbortError");
    const bytes = new Uint8Array(await image.slice(0, 4096).arrayBuffer());
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    const result = Array.from({ length: CLIP_EMBEDDING_DIMENSION }, (_, i) => Math.sin((hash >>> 0) * 0.000001 + i * 0.73));
    const norm = Math.hypot(...result);
    return result.map((value) => value / norm);
  }
}
