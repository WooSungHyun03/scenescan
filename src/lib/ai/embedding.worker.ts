import { pipeline, RawImage } from "@huggingface/transformers";
import { CLIP_EMBEDDING_DIMENSION, CLIP_MODEL_ID } from "./embedding-service";

let extractorPromise: ReturnType<typeof pipeline<"image-feature-extraction">> | null = null;

self.onmessage = async (event: MessageEvent<{ id: number; image: Blob }>) => {
  const { id, image } = event.data;
  try {
    extractorPromise ??= pipeline("image-feature-extraction", CLIP_MODEL_ID);
    const extractor = await extractorPromise;
    const rawImage = await RawImage.fromBlob(image);
    const features = await extractor(rawImage);
    const embedding = Array.from(features.data, Number);
    if (embedding.length !== CLIP_EMBEDDING_DIMENSION) throw new Error(`Expected ${CLIP_EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`);
    self.postMessage({ id, embedding });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Embedding failed" });
  }
};
