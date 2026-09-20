import { pipeline, RawImage } from "@huggingface/transformers";
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from "./embedding-service";
import { createEmbeddingWorkerHandler } from "./embedding-worker-runtime";
import type { EmbeddingWorkerRequest } from "./embedding-worker-protocol";

const handleRequest = createEmbeddingWorkerHandler({
  loadExtractor: (onProgress) => pipeline("image-feature-extraction", CLIP_MODEL_ID, {
    revision: CLIP_MODEL_REVISION,
    progress_callback: (event) => {
      if (event.status === "progress_total") onProgress(event.progress);
    },
  }),
  decodeImage: (image) => RawImage.fromBlob(image),
  getDimensions: (image) => ({ width: image.width, height: image.height }),
  postMessage: (message) => self.postMessage(message),
});

self.onmessage = (event: MessageEvent<EmbeddingWorkerRequest>) => {
  void handleRequest(event.data);
};
