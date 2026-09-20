import { CLIP_EMBEDDING_DIMENSION } from "./embedding-service";

export function toValidatedEmbedding(values: ArrayLike<number | bigint>): number[] {
  if (values.length !== CLIP_EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected ${CLIP_EMBEDDING_DIMENSION} embedding dimensions, got ${values.length}`,
    );
  }

  const embedding = Array.from(values, Number);
  const invalidIndex = embedding.findIndex((value) => !Number.isFinite(value));
  if (invalidIndex !== -1) {
    throw new Error(`Embedding contains a non-finite value at index ${invalidIndex}`);
  }

  return embedding;
}
