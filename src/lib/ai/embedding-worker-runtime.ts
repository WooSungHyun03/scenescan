import { toValidatedEmbedding } from "./embedding-validation";
import type {
  EmbeddingWorkerReply,
  EmbeddingWorkerRequest,
} from "./embedding-worker-protocol";
import { validateImageDimensions } from "./image-validation";

type FeatureExtractor<Input> = (image: Input) => Promise<{ data: ArrayLike<number | bigint> }>;

type EmbeddingWorkerDependencies<Input> = {
  loadExtractor: (onProgress: (progress: number) => void) => Promise<FeatureExtractor<Input>>;
  decodeImage: (image: Blob) => Promise<Input>;
  getDimensions: (image: Input) => { width: number; height: number };
  postMessage: (message: EmbeddingWorkerReply) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Embedding failed";
}

export function createEmbeddingWorkerHandler<Input>({
  loadExtractor,
  decodeImage,
  getDimensions,
  postMessage,
}: EmbeddingWorkerDependencies<Input>) {
  let extractorPromise: Promise<FeatureExtractor<Input>> | null = null;

  async function getExtractor(): Promise<FeatureExtractor<Input>> {
    if (!extractorPromise) {
      postMessage({ type: "status", status: "loading" });
      extractorPromise = loadExtractor((progress) => {
        postMessage({
          type: "status",
          status: "loading",
          progress: Math.min(100, Math.max(0, progress)),
        });
      })
        .then((extractor) => {
          postMessage({ type: "status", status: "ready" });
          return extractor;
        })
        .catch((error: unknown) => {
          const message = errorMessage(error);
          postMessage({ type: "status", status: "error", error: message });
          extractorPromise = null;
          throw error;
        });
    }
    return extractorPromise;
  }

  return async (request: EmbeddingWorkerRequest): Promise<void> => {
    const { id, image } = request;
    try {
      const decodedImage = await decodeImage(image);
      const { width, height } = getDimensions(decodedImage);
      validateImageDimensions(width, height);
      const extractor = await getExtractor();
      const features = await extractor(decodedImage);
      postMessage({
        type: "result",
        id,
        embedding: toValidatedEmbedding(features.data),
      });
    } catch (error) {
      postMessage({ type: "error", id, error: errorMessage(error) });
    }
  };
}
