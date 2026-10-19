import { toValidatedEmbedding } from "./embedding-validation";
import type {
  EmbeddingWorkerReply,
  EmbeddingWorkerRequest,
} from "./embedding-worker-protocol";
import { validateImageDimensions } from "./image-validation";
import type { ClipBrowserDevice } from "./embedding-service";

type FeatureExtractor<Input> = (image: Input) => Promise<{ data: ArrayLike<number | bigint> }>;
type LoadedFeatureExtractor<Input> = {
  extractor: FeatureExtractor<Input>;
  device: ClipBrowserDevice;
};

type EmbeddingWorkerDependencies<Input> = {
  loadExtractor: (onProgress: (progress: number) => void) => Promise<FeatureExtractor<Input> | LoadedFeatureExtractor<Input>>;
  decodeImage: (image: Blob) => Promise<Input>;
  getDimensions: (image: Input) => { width: number; height: number };
  postMessage: (message: EmbeddingWorkerReply) => void;
  now?: () => number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Embedding failed";
}

export function createEmbeddingWorkerHandler<Input>({
  loadExtractor,
  decodeImage,
  getDimensions,
  postMessage,
  now = () => performance.now(),
}: EmbeddingWorkerDependencies<Input>) {
  let extractorPromise: Promise<LoadedFeatureExtractor<Input>> | null = null;
  let requestChain = Promise.resolve();
  const pending = new Set<number>();
  const cancelled = new Set<number>();

  async function getExtractor(): Promise<LoadedFeatureExtractor<Input>> {
    if (!extractorPromise) {
      postMessage({ type: "status", status: "loading" });
      extractorPromise = loadExtractor((progress) => {
        postMessage({
          type: "status",
          status: "loading",
          progress: Math.min(100, Math.max(0, progress)),
        });
      })
        .then((loaded) => {
          const result = typeof loaded === "function"
            ? { extractor: loaded, device: "wasm" as const }
            : loaded;
          postMessage({ type: "status", status: "ready" });
          return result;
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

  async function processRequest(
    request: Extract<EmbeddingWorkerRequest, { type: "embed" }>,
    receivedAt: number,
  ): Promise<void> {
    const { id, image } = request;
    const queueWaitMs = now() - receivedAt;
    try {
      if (cancelled.has(id)) return;
      const decodeStartedAt = now();
      const decodedImage = await decodeImage(image);
      if (cancelled.has(id)) return;
      const decodeMs = now() - decodeStartedAt;
      const { width, height } = getDimensions(decodedImage);
      validateImageDimensions(width, height);
      const modelWasCached = extractorPromise !== null;
      const modelWaitStartedAt = now();
      const { extractor, device } = await getExtractor();
      if (cancelled.has(id)) return;
      const modelWaitMs = now() - modelWaitStartedAt;
      const inferenceStartedAt = now();
      const features = await extractor(decodedImage);
      // Active inference cannot be preempted, but its cancelled result is unused.
      if (cancelled.has(id)) return;
      const inferenceMs = now() - inferenceStartedAt;
      postMessage({
        type: "result",
        id,
        embedding: toValidatedEmbedding(features.data),
        timing: {
          totalMs: now() - receivedAt,
          decodeMs,
          modelWaitMs,
          queueWaitMs,
          inferenceMs,
          modelWasCached,
          device,
        },
      });
    } catch (error) {
      if (!cancelled.has(id)) {
        postMessage({ type: "error", id, error: errorMessage(error) });
      }
    } finally {
      pending.delete(id);
      cancelled.delete(id);
    }
  }

  return (request: EmbeddingWorkerRequest): Promise<void> => {
    if (request.type === "cancel") {
      // A late cancel may arrive after a result; do not retain orphan IDs.
      if (pending.has(request.id)) cancelled.add(request.id);
      return Promise.resolve();
    }
    pending.add(request.id);
    const receivedAt = now();
    const result = requestChain.then(() => processRequest(request, receivedAt));
    requestChain = result.catch(() => undefined);
    return result;
  };
}
