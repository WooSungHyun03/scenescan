import type { EmbeddingManifest } from "../embeddings/contracts.ts";
import type { NormalizedLocationOutput } from "./contracts.ts";

export type ProductionImportMode = "validate-only" | "dry-run" | "apply";

export type LocationRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  region: string;
  address: string;
  latitude: number;
  longitude: number;
  permit_type: string;
  contact_name: string | null;
  contact_phone: string | null;
  permit_note: string | null;
  noise_sources: string[];
  source_url: string;
};

export type ImageMetadataRow = {
  id: string;
  location_id: string;
  image_url: string;
  alt: string;
};

export type ProductionRows = { locations: LocationRow[]; images: ImageMetadataRow[] };
export type ExistingImageMetadata = { id: string; location_id: string };

export interface ProductionImportDatabase {
  findLocationIds(ids: string[]): Promise<string[]>;
  findExistingImages(ids: string[]): Promise<ExistingImageMetadata[]>;
  upsertLocations(rows: LocationRow[]): Promise<void>;
  upsertImages(rows: ImageMetadataRow[]): Promise<void>;
}

export type ProductionImportResult = {
  mode: ProductionImportMode;
  locationsValidated: number;
  imagesValidated: number;
  existingLocations: number;
  existingImages: number;
  locationsWritten: number;
  imagesWritten: number;
};

function requiredId(id: string | undefined, label: string): string {
  if (!id) throw new Error(`${label} requires a stable UUID before production import`);
  return id;
}

export function createProductionRows(
  dataset: NormalizedLocationOutput,
  embeddingManifest: EmbeddingManifest,
): ProductionRows {
  if (dataset.reviewQueue.length > 0) throw new Error("Production data contains unresolved review items");
  const embeddingsByUrl = new Map(embeddingManifest.items.map((item) => [item.image_url, item]));
  if (embeddingsByUrl.size !== embeddingManifest.items.length) throw new Error("Embedding manifest contains duplicate image_url values");

  const locations: LocationRow[] = [];
  const images: ImageMetadataRow[] = [];
  for (const location of dataset.locations) {
    const locationId = requiredId(location.id, `Location ${location.name}`);
    if (location.parking.length > 0) {
      throw new Error(`Production importer does not accept unreviewed parking records: ${location.name}`);
    }
    locations.push({
      id: locationId,
      name: location.name,
      description: location.description,
      category: location.category,
      region: location.region,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      permit_type: location.permit.type,
      contact_name: location.permit.contactName,
      contact_phone: location.permit.contactPhone,
      permit_note: location.permit.note,
      noise_sources: [],
      source_url: location.sourceUrl,
    });
    for (const image of location.images) {
      const entry = embeddingsByUrl.get(image.imageUrl);
      if (!entry) throw new Error(`Image is missing from embedding manifest: ${image.imageUrl}`);
      if (entry.location_id !== locationId) throw new Error(`Image location_id mismatch: ${entry.image_id}`);
      images.push({ id: entry.image_id, location_id: locationId, image_url: image.imageUrl, alt: image.alt });
      embeddingsByUrl.delete(image.imageUrl);
    }
  }
  if (embeddingsByUrl.size > 0) {
    throw new Error(`Embedding manifest contains ${embeddingsByUrl.size} image(s) absent from location data`);
  }
  return { locations, images };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export async function importProductionData(
  rows: ProductionRows,
  mode: ProductionImportMode,
  batchSize: number,
  database?: ProductionImportDatabase,
): Promise<ProductionImportResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("import batch size must be an integer between 1 and 500");
  }
  const base = {
    mode,
    locationsValidated: rows.locations.length,
    imagesValidated: rows.images.length,
    existingLocations: 0,
    existingImages: 0,
    locationsWritten: 0,
    imagesWritten: 0,
  };
  if (mode === "validate-only") return base;
  if (!database) throw new Error(`Database connection is required for ${mode}`);

  const existingLocationIds: string[] = [];
  for (const batch of chunks(rows.locations.map((row) => row.id), batchSize)) {
    existingLocationIds.push(...await database.findLocationIds(batch));
  }
  const existingImages: ExistingImageMetadata[] = [];
  for (const batch of chunks(rows.images.map((row) => row.id), batchSize)) {
    existingImages.push(...await database.findExistingImages(batch));
  }
  const candidates = new Map(rows.images.map((row) => [row.id, row]));
  for (const existing of existingImages) {
    const candidate = candidates.get(existing.id);
    if (candidate && candidate.location_id !== existing.location_id) {
      throw new Error(`Existing image ${existing.id} belongs to a different location`);
    }
  }

  if (mode === "dry-run") {
    return { ...base, existingLocations: existingLocationIds.length, existingImages: existingImages.length };
  }
  for (const batch of chunks(rows.locations, batchSize)) await database.upsertLocations(batch);
  for (const batch of chunks(rows.images, batchSize)) await database.upsertImages(batch);
  return {
    ...base,
    existingLocations: existingLocationIds.length,
    existingImages: existingImages.length,
    locationsWritten: rows.locations.length,
    imagesWritten: rows.images.length,
  };
}
