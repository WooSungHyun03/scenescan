import { CLIP_EMBEDDING_DIMENSION } from "../../src/lib/ai/embedding-service.ts";
import { toValidatedEmbedding } from "../../src/lib/ai/embedding-validation.ts";
import { vectorNorm } from "../../src/lib/ai/vector-math.ts";
import type { EmbeddingOutput, EmbeddingOutputItem } from "./contracts.ts";

export type ImportMode = "validate-only" | "dry-run" | "apply";

export type ImportRow = {
  id: string;
  location_id: string;
  image_url: string;
  embedding: string;
};

export type ExistingImage = { id: string; location_id: string };
export type RpcProbeRow = { location_image_id: string; location_id: string; similarity: number };

export interface EmbeddingImportDatabase {
  findLocationIds(ids: string[]): Promise<string[]>;
  findExistingImages(ids: string[]): Promise<ExistingImage[]>;
  probeRpc(embedding: number[]): Promise<RpcProbeRow[]>;
  upsertImages(rows: ImportRow[]): Promise<void>;
}

export type ImportResult = {
  mode: ImportMode;
  validated: number;
  existing: number;
  written: number;
};

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function validateItem(item: EmbeddingOutputItem): ImportRow {
  const embedding = toValidatedEmbedding(item.embedding);
  if (vectorNorm(embedding) === 0) throw new Error(`Embedding has zero norm: ${item.image_id}`);
  return {
    id: item.image_id,
    location_id: item.location_id,
    image_url: item.image_url,
    embedding: vectorLiteral(embedding),
  };
}

export function createImportRows(output: EmbeddingOutput): ImportRow[] {
  if (output.failures.length > 0) {
    throw new Error(`Embedding output contains ${output.failures.length} unresolved failure(s)`);
  }
  if (output.items.length === 0) throw new Error("Embedding output contains no completed items");
  const imageUrls = new Set<string>();
  return output.items.map((item) => {
    if (imageUrls.has(item.image_url)) throw new Error(`Duplicate image_url: ${item.image_url}`);
    imageUrls.add(item.image_url);
    return validateItem(item);
  });
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function validateRpcRows(rows: RpcProbeRow[]): void {
  for (const row of rows) {
    if (!Number.isFinite(row.similarity) || row.similarity < -1.000001 || row.similarity > 1.000001) {
      throw new Error(`RPC returned invalid cosine similarity for ${row.location_image_id}`);
    }
  }
}

export async function importEmbeddings(
  output: EmbeddingOutput,
  mode: ImportMode,
  batchSize: number,
  database?: EmbeddingImportDatabase,
): Promise<ImportResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("import batch size must be an integer between 1 and 500");
  }
  const rows = createImportRows(output);
  if (mode === "validate-only") return { mode, validated: rows.length, existing: 0, written: 0 };
  if (!database) throw new Error(`Database connection is required for ${mode}`);

  const locationIds = [...new Set(rows.map((row) => row.location_id))];
  const foundLocationIds: string[] = [];
  for (const batch of chunks(locationIds, batchSize)) {
    foundLocationIds.push(...await database.findLocationIds(batch));
  }
  const found = new Set(foundLocationIds);
  const missing = locationIds.filter((id) => !found.has(id));
  if (missing.length > 0) throw new Error(`Missing location_id values: ${missing.join(", ")}`);

  const existingImages: ExistingImage[] = [];
  for (const batch of chunks(rows.map((row) => row.id), batchSize)) {
    existingImages.push(...await database.findExistingImages(batch));
  }
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const existing of existingImages) {
    const candidate = rowsById.get(existing.id);
    if (candidate && candidate.location_id !== existing.location_id) {
      throw new Error(`Existing image ${existing.id} belongs to a different location`);
    }
  }

  const probe = new Array(CLIP_EMBEDDING_DIMENSION).fill(0);
  probe[0] = 1;
  validateRpcRows(await database.probeRpc(probe));

  if (mode === "dry-run") {
    return { mode, validated: rows.length, existing: existingImages.length, written: 0 };
  }
  for (const batch of chunks(rows, batchSize)) await database.upsertImages(batch);
  return { mode, validated: rows.length, existing: existingImages.length, written: rows.length };
}
