import { describe, expect, it, vi } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";
import type {
  EmbeddingWorkerReply,
  EmbeddingWorkerRequest,
} from "./embedding-worker-protocol";
import { TransformersJsEmbeddingService } from "./transformers-js-embedding-service";

class FakeWorker {
  onmessage: ((event: MessageEvent<EmbeddingWorkerReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: EmbeddingWorkerRequest[] = [];
  terminate = vi.fn();

  postMessage(message: EmbeddingWorkerRequest): void {
    this.messages.push(message);
  }

  reply(message: EmbeddingWorkerReply): void {
    this.onmessage?.({ data: message } as MessageEvent<EmbeddingWorkerReply>);
  }

  fail(): void {
    this.onerror?.({} as ErrorEvent);
  }
}

const validEmbedding = () => new Array(CLIP_EMBEDDING_DIMENSION).fill(0.25);
const pngBlob = (contents = "image") => new Blob([contents], { type: "image/png" });

describe("TransformersJsEmbeddingService", () => {
  it("reuses one worker and resolves concurrent requests by ID", async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const service = new TransformersJsEmbeddingService(factory);

    const first = service.embed(pngBlob("first"));
    const second = service.embed(pngBlob("second"));
    expect(worker.messages.map(({ id }) => id)).toEqual([1, 2]);

    worker.reply({ type: "result", id: 2, embedding: validEmbedding() });
    worker.reply({ type: "result", id: 1, embedding: validEmbedding() });

    await expect(first).resolves.toHaveLength(CLIP_EMBEDDING_DIMENSION);
    await expect(second).resolves.toHaveLength(CLIP_EMBEDDING_DIMENSION);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("publishes model loading states", () => {
    const worker = new FakeWorker();
    const service = new TransformersJsEmbeddingService(() => worker);
    const listener = vi.fn();
    service.subscribe(listener);
    void service.embed(pngBlob());

    worker.reply({ type: "status", status: "loading" });
    worker.reply({ type: "status", status: "ready" });

    expect(listener.mock.calls.map(([status]) => status.state)).toEqual([
      "idle",
      "loading",
      "ready",
    ]);
    expect(service.getStatus()).toEqual({ state: "ready" });
  });

  it("rejects worker request errors without affecting other requests", async () => {
    const worker = new FakeWorker();
    const service = new TransformersJsEmbeddingService(() => worker);
    const failed = service.embed(pngBlob());
    const successful = service.embed(pngBlob());

    worker.reply({ type: "error", id: 1, error: "Unable to decode image" });
    worker.reply({ type: "result", id: 2, embedding: validEmbedding() });

    await expect(failed).rejects.toThrow("Unable to decode image");
    await expect(successful).resolves.toHaveLength(CLIP_EMBEDDING_DIMENSION);
  });

  it("validates worker output on the main thread", async () => {
    const worker = new FakeWorker();
    const service = new TransformersJsEmbeddingService(() => worker);
    const result = service.embed(pngBlob());
    const invalid = validEmbedding();
    invalid[4] = Number.POSITIVE_INFINITY;

    worker.reply({ type: "result", id: 1, embedding: invalid });

    await expect(result).rejects.toThrow("non-finite");
  });

  it("rejects all pending work, terminates, and can recreate a failed worker", async () => {
    const failedWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const workers = [failedWorker, replacementWorker];
    const service = new TransformersJsEmbeddingService(() => workers.shift()!, 0);
    const first = service.embed(pngBlob());
    const second = service.embed(pngBlob());

    failedWorker.fail();

    await expect(first).rejects.toThrow("Embedding worker failed");
    await expect(second).rejects.toThrow("Embedding worker failed");
    expect(service.getStatus()).toEqual({ state: "error", error: "Embedding worker failed" });

    const retry = service.embed(pngBlob());
    replacementWorker.reply({ type: "result", id: 3, embedding: validEmbedding() });
    await expect(retry).resolves.toHaveLength(CLIP_EMBEDDING_DIMENSION);
  });

  it("retries interrupted requests once on a replacement worker", async () => {
    const failedWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const workers = [failedWorker, replacementWorker];
    const service = new TransformersJsEmbeddingService(() => workers.shift()!);
    const result = service.embed(pngBlob());

    failedWorker.fail();
    expect(replacementWorker.messages).toEqual([
      expect.objectContaining({ type: "embed", id: 2 }),
    ]);
    replacementWorker.reply({ type: "result", id: 2, embedding: validEmbedding() });

    await expect(result).resolves.toHaveLength(CLIP_EMBEDDING_DIMENSION);
    expect(failedWorker.terminate).toHaveBeenCalledOnce();
  });

  it("cleans up a timed-out request and restarts on the next request", async () => {
    vi.useFakeTimers();
    const firstWorker = new FakeWorker();
    const secondWorker = new FakeWorker();
    const workers = [firstWorker, secondWorker];
    const service = new TransformersJsEmbeddingService(() => workers.shift()!);
    const timedOut = service.embed(pngBlob(), { timeoutMs: 25 });
    const timeoutExpectation = expect(timedOut).rejects.toThrow("timed out after 25 ms");

    await vi.advanceTimersByTimeAsync(25);
    await timeoutExpectation;
    expect(firstWorker.terminate).toHaveBeenCalledOnce();
    expect(service.getStatus()).toEqual({ state: "idle" });

    const retry = service.embed(pngBlob());
    secondWorker.reply({ type: "result", id: 2, embedding: validEmbedding() });
    await expect(retry).resolves.toHaveLength(CLIP_EMBEDDING_DIMENSION);
    vi.useRealTimers();
  });

  it("supports aborting a request", async () => {
    const worker = new FakeWorker();
    const service = new TransformersJsEmbeddingService(() => worker);
    const controller = new AbortController();
    const result = service.embed(pngBlob(), { signal: controller.signal });

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(service.getStatus()).toEqual({ state: "idle" });
  });

  it("rejects unsupported input before starting a worker", async () => {
    const factory = vi.fn(() => new FakeWorker());
    const service = new TransformersJsEmbeddingService(factory);

    await expect(service.embed(new Blob(["svg"], { type: "image/svg+xml" })))
      .rejects.toThrow("Unsupported image type");
    expect(factory).not.toHaveBeenCalled();
  });

  it("publishes bounded model download progress", () => {
    const worker = new FakeWorker();
    const service = new TransformersJsEmbeddingService(() => worker);
    void service.embed(pngBlob());

    worker.reply({ type: "status", status: "loading", progress: 42.5 });

    expect(service.getStatus()).toEqual({ state: "loading", progress: 42.5 });
  });

  it("handles rapid repeated requests without losing a result", async () => {
    const worker = new FakeWorker();
    const service = new TransformersJsEmbeddingService(() => worker);
    const requests = Array.from({ length: 25 }, (_, index) => service.embed(pngBlob(`${index}`)));

    for (const { id } of [...worker.messages].reverse()) {
      worker.reply({ type: "result", id, embedding: validEmbedding() });
    }

    const results = await Promise.all(requests);
    expect(results).toHaveLength(25);
    expect(results.every((embedding) => embedding.length === CLIP_EMBEDDING_DIMENSION)).toBe(true);
  });
});
