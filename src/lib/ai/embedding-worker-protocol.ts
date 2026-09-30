import type { ClipBrowserDevice, EmbeddingServiceState } from "./embedding-service";

export type EmbeddingWorkerRequest =
  | { type: "embed"; id: number; image: Blob }
  | { type: "cancel"; id: number };

export type EmbeddingWorkerTiming = {
  totalMs: number;
  decodeMs: number;
  modelWaitMs: number;
  queueWaitMs: number;
  inferenceMs: number;
  modelWasCached: boolean;
  device: ClipBrowserDevice;
};

export type EmbeddingWorkerReply =
  | { type: "status"; status: EmbeddingServiceState; error?: string; progress?: number }
  | { type: "result"; id: number; embedding: number[]; timing?: EmbeddingWorkerTiming }
  | { type: "error"; id: number; error: string };
