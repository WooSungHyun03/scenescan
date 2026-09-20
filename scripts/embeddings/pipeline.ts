import { access, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CLIP_EMBEDDING_DIMENSION,
  CLIP_MODEL_ID,
  CLIP_MODEL_REVISION,
  MAX_IMAGE_BYTES,
} from "../../src/lib/ai/embedding-service.ts";
import { toValidatedEmbedding } from "../../src/lib/ai/embedding-validation.ts";
import { validateImageBlob, validateImageDimensions } from "../../src/lib/ai/image-validation.ts";
import {
  createEmptyOutput,
  parseManifest,
  parseOutput,
  type EmbeddingFailure,
  type EmbeddingManifestEntry,
  type EmbeddingOutput,
  type EmbeddingOutputItem,
} from "./contracts.ts";

export type EmbeddingPipelineOptions = {
  manifestPath: string;
  outputPath: string;
  batchSize: number;
  retries: number;
  resume: boolean;
};

type DecodedImage = { value: unknown; width: number; height: number };

export type EmbeddingPipelineDependencies = {
  transformersVersion: string;
  decodeImage: (absolutePath: string) => Promise<DecodedImage>;
  loadExtractor: () => Promise<(images: unknown[]) => Promise<ArrayLike<number | bigint>>>;
  onProgress?: (message: string) => void;
};

export type EmbeddingPipelineResult = {
  output: EmbeddingOutput;
  processed: number;
  resumed: number;
};

export function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((value, index) => bytes[index] === value)) {
    return "image/png";
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  throw new Error("Unsupported or corrupt image bytes; expected JPEG, PNG, or WebP");
}

export async function decodeLocalImage(absolutePath: string): Promise<DecodedImage> {
  const file = await stat(absolutePath);
  if (!file.isFile()) throw new Error("Image path must reference a regular file");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`);
  }
  const bytes = await readFile(absolutePath);
  const mime = detectImageMime(bytes);
  const blob = new Blob([bytes], { type: mime });
  validateImageBlob(blob);
  const { RawImage } = await import("@huggingface/transformers");
  const image = await RawImage.fromBlob(blob);
  validateImageDimensions(image.width, image.height);
  return { value: image, width: image.width, height: image.height };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeOutputAtomically(path: string, output: EmbeddingOutput): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function orderedOutput(
  entries: EmbeddingManifestEntry[],
  completed: Map<string, EmbeddingOutputItem>,
  failed: Map<string, EmbeddingFailure>,
  transformersVersion: string,
): EmbeddingOutput {
  const output = createEmptyOutput(transformersVersion);
  output.items = entries.flatMap((entry) => {
    const item = completed.get(entry.image_id);
    return item ? [item] : [];
  });
  output.failures = entries.flatMap((entry) => {
    const failure = failed.get(entry.image_id);
    return failure ? [failure] : [];
  });
  return output;
}

function matchesManifest(item: EmbeddingOutputItem, entry: EmbeddingManifestEntry): boolean {
  return item.image_id === entry.image_id
    && item.location_id === entry.location_id
    && item.image_path === entry.image_path
    && item.image_url === entry.image_url
    && item.source === entry.source
    && item.source_url === entry.source_url;
}

function validateOptions(options: EmbeddingPipelineOptions): void {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 64) {
    throw new Error("batch size must be an integer between 1 and 64");
  }
  if (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 5) {
    throw new Error("retries must be an integer between 0 and 5");
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function embedWithRetries(
  extractor: (images: unknown[]) => Promise<ArrayLike<number | bigint>>,
  images: unknown[],
  retries: number,
): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const data = Array.from(await extractor(images), Number);
      const expectedLength = images.length * CLIP_EMBEDDING_DIMENSION;
      if (data.length !== expectedLength) {
        throw new Error(`Expected ${expectedLength} batched values, got ${data.length}`);
      }
      return images.map((_, index) => toValidatedEmbedding(
        data.slice(index * CLIP_EMBEDDING_DIMENSION, (index + 1) * CLIP_EMBEDDING_DIMENSION),
      ));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Embedding batch failed");
}

export async function prepareEmbeddings(
  options: EmbeddingPipelineOptions,
  dependencies: EmbeddingPipelineDependencies,
): Promise<EmbeddingPipelineResult> {
  validateOptions(options);
  const manifest = parseManifest(await readJson(options.manifestPath));
  const completed = new Map<string, EmbeddingOutputItem>();
  const failed = new Map<string, EmbeddingFailure>();

  if (options.resume && await pathExists(options.outputPath)) {
    const existing = parseOutput(await readJson(options.outputPath));
    if (existing.model.transformers_js_version !== dependencies.transformersVersion) {
      throw new Error("Existing output uses a different Transformers.js version; rerun with --no-resume");
    }
    const entriesById = new Map(manifest.items.map((entry) => [entry.image_id, entry]));
    for (const item of existing.items) {
      const entry = entriesById.get(item.image_id);
      if (entry && matchesManifest(item, entry)) completed.set(item.image_id, item);
    }
    for (const failure of existing.failures) failed.set(failure.image_id, failure);
  }

  const pending = manifest.items.filter((entry) => !completed.has(entry.image_id));
  const resumed = manifest.items.length - pending.length;
  if (pending.length === 0) {
    const output = orderedOutput(manifest.items, completed, failed, dependencies.transformersVersion);
    await writeOutputAtomically(options.outputPath, output);
    return {
      output,
      processed: 0,
      resumed,
    };
  }

  const extractor = await dependencies.loadExtractor();
  let processed = 0;
  for (const batch of chunks(pending, options.batchSize)) {
    const decoded: Array<{ entry: EmbeddingManifestEntry; image: DecodedImage }> = [];
    for (const entry of batch) {
      try {
        const absolutePath = resolve(dirname(options.manifestPath), entry.image_path);
        const image = await dependencies.decodeImage(absolutePath);
        validateImageDimensions(image.width, image.height);
        decoded.push({ entry, image });
      } catch (error) {
        const previousAttempts = failed.get(entry.image_id)?.attempts ?? 0;
        failed.set(entry.image_id, {
          ...entry,
          attempts: previousAttempts + 1,
          error: error instanceof Error ? error.message : "Image validation failed",
        });
      }
    }

    if (decoded.length > 0) {
      try {
        const embeddings = await embedWithRetries(
          extractor,
          decoded.map(({ image }) => image.value),
          options.retries,
        );
        decoded.forEach(({ entry }, index) => {
          completed.set(entry.image_id, {
            ...entry,
            model_id: CLIP_MODEL_ID,
            model_revision: CLIP_MODEL_REVISION,
            transformers_js_version: dependencies.transformersVersion,
            embedding: embeddings[index],
          });
          failed.delete(entry.image_id);
        });
      } catch (error) {
        for (const { entry } of decoded) {
          const previousAttempts = failed.get(entry.image_id)?.attempts ?? 0;
          failed.set(entry.image_id, {
            ...entry,
            attempts: previousAttempts + options.retries + 1,
            error: error instanceof Error ? error.message : "Embedding batch failed",
          });
        }
      }
    }

    processed += batch.length;
    const output = orderedOutput(manifest.items, completed, failed, dependencies.transformersVersion);
    await writeOutputAtomically(options.outputPath, output);
    dependencies.onProgress?.(`Processed ${processed}/${pending.length}; completed=${output.items.length}; failed=${output.failures.length}`);
  }

  return {
    output: orderedOutput(manifest.items, completed, failed, dependencies.transformersVersion),
    processed,
    resumed,
  };
}
