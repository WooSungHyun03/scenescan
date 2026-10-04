import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "@huggingface/transformers";
import { z } from "zod";
import {
  CLIP_EMBEDDING_DIMENSION,
  CLIP_MODEL_ID,
  CLIP_MODEL_REVISION,
  CLIP_MODEL_DTYPE,
} from "../../src/lib/ai/embedding-config.ts";
import { toValidatedEmbedding } from "../../src/lib/ai/embedding-validation.ts";
import { cosineSimilarity } from "../../src/lib/ai/vector-math.ts";
import { decodeLocalImage } from "./pipeline.ts";
import { parseEvaluationDataset, type RetrievalEvaluationDataset } from "./evaluation.ts";

const categorySchema = z.enum(["urban", "nature", "industrial", "interior"]);
const candidateSchema = z.object({
  location_id: z.string().trim().min(1),
  location_image_id: z.string().trim().min(1),
  category: categorySchema,
  image_path: z.string().trim().min(1),
}).strict();
const querySchema = z.object({
  query_id: z.string().trim().min(1),
  category: categorySchema,
  image_path: z.string().trim().min(1),
  expected_location_ids: z.array(z.string().trim().min(1)).min(1),
}).strict();
const indexSchema = z.object({
  schema_version: z.literal(1),
  name: z.string().trim().min(1),
  license: z.string().trim().min(1),
  source_url: z.string().url(),
  candidates: z.array(candidateSchema).min(1),
  queries: z.array(querySchema).min(1),
}).strict();

export type ClipEvaluationIndex = z.infer<typeof indexSchema>;

function rejectDuplicates(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function parseClipEvaluationIndex(value: unknown): ClipEvaluationIndex {
  const index = indexSchema.parse(value);
  rejectDuplicates(index.candidates.map((candidate) => candidate.location_id), "candidate location_id");
  rejectDuplicates(index.candidates.map((candidate) => candidate.location_image_id), "candidate location_image_id");
  rejectDuplicates(index.queries.map((query) => query.query_id), "query_id");
  rejectDuplicates([
    ...index.candidates.map((candidate) => candidate.image_path),
    ...index.queries.map((query) => query.image_path),
  ], "image_path");
  const candidateIds = new Set(index.candidates.map((candidate) => candidate.location_id));
  for (const query of index.queries) {
    rejectDuplicates(query.expected_location_ids, `expected location in ${query.query_id}`);
    for (const expectedId of query.expected_location_ids) {
      if (!candidateIds.has(expectedId)) throw new Error(`Unknown expected location ${expectedId} in ${query.query_id}`);
    }
  }
  return index;
}

export function buildClipEvaluationDataset(
  index: ClipEvaluationIndex,
  embeddingsByPath: ReadonlyMap<string, readonly number[]>,
  transformersVersion: string,
): RetrievalEvaluationDataset {
  const getEmbedding = (path: string): number[] => {
    const embedding = embeddingsByPath.get(path);
    if (!embedding) throw new Error(`Missing embedding for ${path}`);
    return toValidatedEmbedding(embedding);
  };
  return parseEvaluationDataset({
    schema_version: 1,
    name: index.name,
    provenance: {
      kind: "synthetic",
      license: index.license,
      source_url: index.source_url,
      score_origin: "clip-cosine",
      model: {
        id: CLIP_MODEL_ID,
        revision: CLIP_MODEL_REVISION,
        embedding_dimension: CLIP_EMBEDDING_DIMENSION,
        transformers_js_version: transformersVersion,
      },
    },
    queries: index.queries.map((query) => {
      const queryEmbedding = getEmbedding(query.image_path);
      return {
        query_id: query.query_id,
        category: query.category,
        reference_image_path: query.image_path,
        expected_location_ids: query.expected_location_ids,
        qualitative_note: "Cropped and horizontally flipped derivative should retrieve its matching source illustration.",
        hits: index.candidates.map((candidate) => ({
          location_image_id: candidate.location_image_id,
          location_id: candidate.location_id,
          similarity: Math.max(-1, Math.min(1, cosineSimilarity(
            queryEmbedding,
            getEmbedding(candidate.image_path),
          ))),
        })),
      };
    }),
  });
}

async function transformersVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(new URL("../../node_modules/@huggingface/transformers/package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string") throw new Error("Unable to determine Transformers.js version");
  return packageJson.version;
}

async function embedPaths(paths: readonly string[], batchSize: number): Promise<Map<string, number[]>> {
  const extractor = await pipeline("image-feature-extraction", CLIP_MODEL_ID, { revision: CLIP_MODEL_REVISION, dtype: CLIP_MODEL_DTYPE });
  const result = new Map<string, number[]>();
  for (let offset = 0; offset < paths.length; offset += batchSize) {
    const batchPaths = paths.slice(offset, offset + batchSize);
    const images = await Promise.all(batchPaths.map(async (path) => (
      (await decodeLocalImage(resolve(path))).value
    )));
    const data = Array.from((await extractor(images as Parameters<typeof extractor>[0])).data, Number);
    const expectedLength = images.length * CLIP_EMBEDDING_DIMENSION;
    if (data.length !== expectedLength) throw new Error(`Expected ${expectedLength} batched values, got ${data.length}`);
    batchPaths.forEach((path, index) => {
      result.set(path, toValidatedEmbedding(data.slice(
        index * CLIP_EMBEDDING_DIMENSION,
        (index + 1) * CLIP_EMBEDDING_DIMENSION,
      )));
    });
    console.log(`Embedded ${Math.min(offset + batchSize, paths.length)}/${paths.length} evaluation images`);
  }
  return result;
}

async function main(): Promise<void> {
  const indexPath = resolve(process.argv[2] ?? "scripts/embeddings/clip-evaluation-index.json");
  const outputPath = resolve(process.argv[3] ?? "scripts/embeddings/clip-evaluation-results.json");
  const index = parseClipEvaluationIndex(JSON.parse(await readFile(indexPath, "utf8")));
  const paths = [
    ...index.candidates.map((candidate) => candidate.image_path),
    ...index.queries.map((query) => query.image_path),
  ];
  const dataset = buildClipEvaluationDataset(index, await embedPaths(paths, 4), await transformersVersion());
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  console.log(`CLIP evaluation scores written to ${outputPath}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
