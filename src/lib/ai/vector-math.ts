export function vectorNorm(vector: ArrayLike<number>): number {
  let squared = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];
    if (!Number.isFinite(value)) throw new Error(`Vector contains a non-finite value at index ${index}`);
    squared += value * value;
  }
  return Math.sqrt(squared);
}

export function normalizeVector(vector: ArrayLike<number>): number[] {
  const norm = vectorNorm(vector);
  if (norm === 0) throw new Error("Cannot normalize a zero vector");
  return Array.from(vector, (value) => value / norm);
}

export function cosineSimilarity(left: ArrayLike<number>, right: ArrayLike<number>): number {
  if (left.length !== right.length) throw new Error("Cosine vectors must have equal dimensions");
  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);
  if (leftNorm === 0 || rightNorm === 0) throw new Error("Cosine similarity is undefined for a zero vector");
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) dot += left[index] * right[index];
  return dot / (leftNorm * rightNorm);
}
