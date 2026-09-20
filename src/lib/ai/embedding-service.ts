export interface ImageEmbeddingService {
  embed(image: File | Blob): Promise<number[]>;
}

export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
export const CLIP_EMBEDDING_DIMENSION = 512;
