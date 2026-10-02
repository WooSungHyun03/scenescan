export function isChunkLoadError(error: Pick<Error, "name" | "message">): boolean {
  return error.name === "ChunkLoadError"
    || /failed to load chunk|loading chunk .+ failed/i.test(error.message);
}
