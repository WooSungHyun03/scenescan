import type { ImageEmbeddingService } from "./embedding-service";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";

type WorkerReply = { id: number; embedding?: number[]; error?: string };

export class TransformersJsEmbeddingService implements ImageEmbeddingService {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: number[]) => void; reject: (reason: Error) => void }>();

  embed(image: File | Blob): Promise<number[]> {
    if (typeof Worker === "undefined") return Promise.reject(new Error("Browser Web Worker required"));
    if (!this.worker) {
      this.worker = new Worker(new URL("./embedding.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const { id, embedding, error } = event.data;
        const task = this.pending.get(id);
        if (!task) return;
        this.pending.delete(id);
        if (error) task.reject(new Error(error));
        else if (embedding?.length === CLIP_EMBEDDING_DIMENSION) task.resolve(embedding);
        else task.reject(new Error("Unexpected CLIP embedding dimension"));
      };
      this.worker.onerror = () => {
        for (const task of this.pending.values()) task.reject(new Error("Embedding worker failed"));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, image });
    });
  }
}
