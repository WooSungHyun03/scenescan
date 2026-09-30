import { describe, expect, it, vi } from "vitest";
import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";
import { createEmbeddingWorkerHandler } from "./embedding-worker-runtime";
import type { EmbeddingWorkerReply } from "./embedding-worker-protocol";

const image = new Blob(["image"]);

describe("embedding worker runtime", () => {
  it("loads the model once and correlates concurrent results by request ID", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const extractor = vi.fn(async () => ({
      data: new Float32Array(CLIP_EMBEDDING_DIMENSION).fill(0.5),
    }));
    const loadExtractor = vi.fn(async () => extractor);
    const handle = createEmbeddingWorkerHandler({
      loadExtractor,
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    await Promise.all([
      handle({ type: "embed", id: 41, image }),
      handle({ type: "embed", id: 99, image }),
    ]);

    expect(loadExtractor).toHaveBeenCalledTimes(1);
    expect(replies.slice(0, 2)).toEqual([
      { type: "status", status: "loading" },
      { type: "status", status: "ready" },
    ]);
    expect(replies).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "result", id: 41 }),
      expect.objectContaining({ type: "result", id: 99 }),
    ]));
  });

  it("returns a request-scoped decode error", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const handle = createEmbeddingWorkerHandler({
      loadExtractor: async () => async () => ({ data: [] }),
      decodeImage: async () => { throw new Error("Unable to decode image"); },
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    await handle({ type: "embed", id: 7, image });

    expect(replies.at(-1)).toEqual({
      type: "error",
      id: 7,
      error: "Unable to decode image",
    });
  });

  it("reports model load failure as status and request errors", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const handle = createEmbeddingWorkerHandler({
      loadExtractor: async () => { throw new Error("Model unavailable"); },
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    await handle({ type: "embed", id: 3, image });

    expect(replies).toEqual([
      { type: "status", status: "loading" },
      { type: "status", status: "error", error: "Model unavailable" },
      { type: "error", id: 3, error: "Model unavailable" },
    ]);
  });

  it("allows a later request to retry after model loading fails", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const extractor = async () => ({
      data: new Float32Array(CLIP_EMBEDDING_DIMENSION),
    });
    const loadExtractor = vi.fn()
      .mockRejectedValueOnce(new Error("Temporary network failure"))
      .mockResolvedValueOnce(extractor);
    const handle = createEmbeddingWorkerHandler({
      loadExtractor,
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    await handle({ type: "embed", id: 1, image });
    await handle({ type: "embed", id: 2, image });

    expect(loadExtractor).toHaveBeenCalledTimes(2);
    expect(replies.at(-1)).toEqual(expect.objectContaining({ type: "result", id: 2 }));
  });

  it("rejects invalid model output before it crosses the worker boundary", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const values = new Array(CLIP_EMBEDDING_DIMENSION).fill(0);
    values[12] = Number.NaN;
    const handle = createEmbeddingWorkerHandler({
      loadExtractor: async () => async () => ({ data: values }),
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    await handle({ type: "embed", id: 12, image });

    expect(replies.at(-1)).toEqual(expect.objectContaining({
      type: "error",
      id: 12,
      error: expect.stringContaining("non-finite"),
    }));
  });

  it("rejects excessive decoded resolution before loading the model", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const loadExtractor = vi.fn(async () => async () => ({ data: [] }));
    const handle = createEmbeddingWorkerHandler({
      loadExtractor,
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 9000, height: 100 }),
      postMessage: (reply) => replies.push(reply),
    });

    await handle({ type: "embed", id: 14, image });

    expect(loadExtractor).not.toHaveBeenCalled();
    expect(replies).toEqual([expect.objectContaining({
      type: "error",
      id: 14,
      error: expect.stringContaining("dimensions"),
    })]);
  });

  it("clamps and publishes model download progress", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    const handle = createEmbeddingWorkerHandler({
      loadExtractor: async (onProgress) => {
        onProgress(125);
        return async () => ({ data: new Float32Array(CLIP_EMBEDDING_DIMENSION) });
      },
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    await handle({ type: "embed", id: 15, image });

    expect(replies).toContainEqual({ type: "status", status: "loading", progress: 100 });
  });

  it("reports decode, model wait, inference, and cache timing without changing the embedding", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    let clock = 0;
    const handle = createEmbeddingWorkerHandler({
      loadExtractor: async () => async () => ({
        data: new Float32Array(CLIP_EMBEDDING_DIMENSION).fill(0.25),
      }),
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
      now: () => {
        const current = clock;
        clock += 2;
        return current;
      },
    });

    await handle({ type: "embed", id: 20, image });
    await handle({ type: "embed", id: 21, image });

    const results = replies.filter((reply) => reply.type === "result");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(expect.objectContaining({
      id: 20,
      timing: {
        totalMs: 16,
        decodeMs: 2,
        modelWaitMs: 2,
        queueWaitMs: 2,
        inferenceMs: 2,
        modelWasCached: false,
        device: "wasm",
      },
    }));
    expect(results[1]).toEqual(expect.objectContaining({
      id: 21,
      timing: expect.objectContaining({ modelWasCached: true }),
    }));
  });

  it("serializes inference and drops a cancelled queued request", async () => {
    const replies: EmbeddingWorkerReply[] = [];
    let active = 0;
    let maximumActive = 0;
    const extractor = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { data: new Float32Array(CLIP_EMBEDDING_DIMENSION).fill(0.5) };
    });
    const handle = createEmbeddingWorkerHandler({
      loadExtractor: async () => extractor,
      decodeImage: async (blob) => blob,
      getDimensions: () => ({ width: 800, height: 600 }),
      postMessage: (reply) => replies.push(reply),
    });

    const first = handle({ type: "embed", id: 31, image });
    const cancelled = handle({ type: "embed", id: 32, image });
    await handle({ type: "cancel", id: 32 });
    const third = handle({ type: "embed", id: 33, image });
    await Promise.all([first, cancelled, third]);

    expect(maximumActive).toBe(1);
    expect(extractor).toHaveBeenCalledTimes(2);
    expect(replies).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "result", id: 31 }),
      expect.objectContaining({ type: "result", id: 33 }),
    ]));
    expect(replies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "result", id: 32 }),
    ]));
  });
});
