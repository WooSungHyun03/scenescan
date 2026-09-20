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
});
