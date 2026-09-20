import type {
  EmbeddingRequestOptions,
  EmbeddingServiceStatus,
  EmbeddingStatusListener,
  ImageEmbeddingService,
} from "./embedding-service";
import { DEFAULT_EMBEDDING_TIMEOUT_MS } from "./embedding-service";
import { toValidatedEmbedding } from "./embedding-validation";
import type {
  EmbeddingWorkerReply,
  EmbeddingWorkerRequest,
} from "./embedding-worker-protocol";
import { validateImageBlob } from "./image-validation";

type WorkerLike = {
  onmessage: ((event: MessageEvent<EmbeddingWorkerReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: EmbeddingWorkerRequest): void;
  terminate(): void;
};

type WorkerFactory = () => WorkerLike;

type PendingTask = {
  id: number;
  image: File | Blob;
  retriesRemaining: number;
  resolve: (value: number[]) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortListener?: () => void;
};

function createWorker(): WorkerLike {
  if (typeof Worker === "undefined") throw new Error("Browser Web Worker required");
  return new Worker(new URL("./embedding.worker.ts", import.meta.url), { type: "module" });
}

export class TransformersJsEmbeddingService implements ImageEmbeddingService {
  private worker: WorkerLike | null = null;
  private sequence = 0;
  private pending = new Map<number, PendingTask>();
  private status: EmbeddingServiceStatus = { state: "idle" };
  private listeners = new Set<EmbeddingStatusListener>();

  constructor(
    private readonly workerFactory: WorkerFactory = createWorker,
    private readonly maxWorkerRetries = 1,
  ) {}

  getStatus(): EmbeddingServiceStatus {
    return this.status;
  }

  subscribe(listener: EmbeddingStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: EmbeddingServiceStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private ensureWorker(): WorkerLike {
    if (!this.worker) {
      const worker = this.workerFactory();
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<EmbeddingWorkerReply>) => {
        const reply = event.data;
        if (reply.type === "status") {
          const status: EmbeddingServiceStatus = { state: reply.status };
          if (reply.error !== undefined) status.error = reply.error;
          if (reply.progress !== undefined) status.progress = reply.progress;
          this.setStatus(status);
          return;
        }
        const { id } = reply;
        const task = this.pending.get(id);
        if (!task) return;
        this.pending.delete(id);
        this.cleanUpTask(task);
        if (reply.type === "error") {
          task.reject(new Error(reply.error));
          return;
        }
        try {
          task.resolve(toValidatedEmbedding(reply.embedding));
        } catch (error) {
          task.reject(error instanceof Error ? error : new Error("Invalid CLIP embedding"));
        }
      };
      worker.onerror = () => {
        if (this.worker !== worker) return;
        this.handleWorkerFailure();
      };
    }
    return this.worker;
  }

  private cleanUpTask(task: PendingTask): void {
    clearTimeout(task.timeout);
    if (task.signal && task.abortListener) {
      task.signal.removeEventListener("abort", task.abortListener);
    }
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private dispatch(task: PendingTask): void {
    task.id = ++this.sequence;
    this.pending.set(task.id, task);
    try {
      this.ensureWorker().postMessage({ type: "embed", id: task.id, image: task.image });
    } catch (error) {
      this.pending.delete(task.id);
      this.cleanUpTask(task);
      const failure = error instanceof Error ? error : new Error("Embedding worker failed to start");
      this.setStatus({ state: "error", error: failure.message });
      task.reject(failure);
    }
  }

  private handleWorkerFailure(): void {
    const interrupted = [...this.pending.values()];
    this.pending.clear();
    this.stopWorker();
    this.setStatus({ state: "error", error: "Embedding worker failed" });

    for (const task of interrupted) {
      if (task.retriesRemaining > 0 && !task.signal?.aborted) {
        task.retriesRemaining -= 1;
        this.dispatch(task);
      } else {
        this.cleanUpTask(task);
        task.reject(new Error("Embedding worker failed"));
      }
    }
  }

  embed(image: File | Blob, options: EmbeddingRequestOptions = {}): Promise<number[]> {
    try {
      validateImageBlob(image);
    } catch (error) {
      return Promise.reject(error);
    }
    if (options.signal?.aborted) {
      return Promise.reject(new DOMException("Embedding cancelled", "AbortError"));
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return Promise.reject(new Error("Embedding timeout must be a positive finite number"));
    }

    return new Promise((resolve, reject) => {
      const task: PendingTask = {
        id: 0,
        image,
        retriesRemaining: this.maxWorkerRetries,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pending.delete(task.id);
          this.cleanUpTask(task);
          reject(new Error(`Embedding timed out after ${timeoutMs} ms`));
          if (this.pending.size === 0) {
            this.stopWorker();
            this.setStatus({ state: "idle" });
          }
        }, timeoutMs),
        signal: options.signal,
      };
      task.abortListener = () => {
        this.pending.delete(task.id);
        this.cleanUpTask(task);
        reject(new DOMException("Embedding cancelled", "AbortError"));
        if (this.pending.size === 0) {
          this.stopWorker();
          this.setStatus({ state: "idle" });
        }
      };
      options.signal?.addEventListener("abort", task.abortListener, { once: true });
      this.dispatch(task);
    });
  }
}
