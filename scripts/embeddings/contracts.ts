import { z } from "zod";
import {
  CLIP_EMBEDDING_DIMENSION,
  CLIP_MODEL_ID,
  CLIP_MODEL_REVISION,
} from "../../src/lib/ai/embedding-service.ts";
import { toValidatedEmbedding } from "../../src/lib/ai/embedding-validation.ts";

const httpUrl = z.string().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);

export const manifestEntrySchema = z.object({
  image_id: z.string().uuid(),
  location_id: z.string().uuid(),
  image_path: z.string().trim().min(1),
  image_url: httpUrl,
  source: z.string().trim().min(1),
  source_url: httpUrl,
}).strict();

const manifestSchema = z.object({
  schema_version: z.literal(1),
  items: z.array(manifestEntrySchema).min(1),
}).strict();

const outputItemSchema = manifestEntrySchema.extend({
  model_id: z.literal(CLIP_MODEL_ID),
  model_revision: z.literal(CLIP_MODEL_REVISION),
  transformers_js_version: z.string().min(1),
  embedding: z.array(z.number().finite()).length(CLIP_EMBEDDING_DIMENSION),
}).strict();

const failureSchema = manifestEntrySchema.extend({
  attempts: z.number().int().positive(),
  error: z.string().min(1),
}).strict();

const outputSchema = z.object({
  schema_version: z.literal(1),
  model: z.object({
    id: z.literal(CLIP_MODEL_ID),
    revision: z.literal(CLIP_MODEL_REVISION),
    embedding_dimension: z.literal(CLIP_EMBEDDING_DIMENSION),
    transformers_js_version: z.string().min(1),
  }).strict(),
  items: z.array(outputItemSchema),
  failures: z.array(failureSchema),
}).strict();

export type EmbeddingManifestEntry = z.infer<typeof manifestEntrySchema>;
export type EmbeddingManifest = z.infer<typeof manifestSchema>;
export type EmbeddingOutputItem = z.infer<typeof outputItemSchema>;
export type EmbeddingFailure = z.infer<typeof failureSchema>;
export type EmbeddingOutput = z.infer<typeof outputSchema>;

function rejectDuplicateIds(entries: EmbeddingManifestEntry[], label: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.image_id)) throw new Error(`Duplicate image_id in ${label}: ${entry.image_id}`);
    seen.add(entry.image_id);
  }
}

export function parseManifest(value: unknown): EmbeddingManifest {
  const manifest = manifestSchema.parse(value);
  rejectDuplicateIds(manifest.items, "manifest");
  return manifest;
}

export function parseOutput(value: unknown): EmbeddingOutput {
  const output = outputSchema.parse(value);
  rejectDuplicateIds(output.items, "output items");
  rejectDuplicateIds(output.failures, "output failures");
  const completed = new Set(output.items.map((item) => item.image_id));
  const overlap = output.failures.find((failure) => completed.has(failure.image_id));
  if (overlap) throw new Error(`image_id appears as completed and failed: ${overlap.image_id}`);
  for (const item of output.items) toValidatedEmbedding(item.embedding);
  return output;
}

export function createEmptyOutput(transformersVersion: string): EmbeddingOutput {
  return {
    schema_version: 1,
    model: {
      id: CLIP_MODEL_ID,
      revision: CLIP_MODEL_REVISION,
      embedding_dimension: CLIP_EMBEDDING_DIMENSION,
      transformers_js_version: transformersVersion,
    },
    items: [],
    failures: [],
  };
}
