import type { EmbeddingServiceState } from "./embedding-service";

export type EmbeddingWorkerRequest = {
  type: "embed";
  id: number;
  image: Blob;
};

export type EmbeddingWorkerReply =
  | { type: "status"; status: EmbeddingServiceState; error?: string; progress?: number }
  | { type: "result"; id: number; embedding: number[] }
  | { type: "error"; id: number; error: string };
