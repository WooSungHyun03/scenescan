import type { EmbeddingServiceState } from "./embedding-service";

export type EmbeddingWorkerRequest = {
  type: "embed";
  id: number;
  image: Blob;
};

export type EmbeddingWorkerTiming = {
  totalMs: number;
  decodeMs: number;
  modelWaitMs: number;
  inferenceMs: number;
  modelWasCached: boolean;
};

export type EmbeddingWorkerReply =
  | { type: "status"; status: EmbeddingServiceState; error?: string; progress?: number }
  | { type: "result"; id: number; embedding: number[]; timing?: EmbeddingWorkerTiming }
  | { type: "error"; id: number; error: string };
