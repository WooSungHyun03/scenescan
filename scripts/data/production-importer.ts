import type { EmbeddingManifest } from "../embeddings/contracts.ts";
import type { NormalizedLocationOutput } from "./contracts.ts";
import { z } from "zod";

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
  source: string;
  author: string | null;
  license: string | null;
  license_url: string | null;
  last_verified_at: string | null;
};

export type ImageMetadataRow = {
  id: string;
  location_id: string;
  image_url: string;
  alt: string;
  source: string | null;
  source_url: string | null;
  author: string | null;
  license: string | null;
  license_url: string | null;
  last_verified_at: string | null;
};

export type ImageLicenseCatalog = {
  verifiedAt: string;
  items: Array<{
    imageId: string;
    locationId: string;
    sourceUrl: string | null;
    author: string | null;
    license: string | null;
    licenseUrl: string | null;
  }>;
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

const optionalText = z.string().trim().min(1).nullable().optional();
const optionalHttpUrl = z.string().trim().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
).nullable().optional();

const imageLicenseCatalogSchema = z.object({
  schema_version: z.literal(1),
  verified_at: z.iso.datetime({ offset: true }),
  items: z.array(z.object({
    image_id: z.string().uuid(),
    location_id: z.string().uuid(),
    commons_page_url: optionalHttpUrl,
    author: optionalText,
    license: optionalText,
    license_url: optionalHttpUrl,
  }).passthrough()),
}).strict();

export function parseImageLicenseCatalog(value: unknown): ImageLicenseCatalog {
  const parsed = imageLicenseCatalogSchema.parse(value);
  const seen = new Set<string>();
  const items = parsed.items.map((item) => {
    if (seen.has(item.image_id)) throw new Error(`Image license catalog contains duplicate image_id: ${item.image_id}`);
    seen.add(item.image_id);
    return {
      imageId: item.image_id,
      locationId: item.location_id,
      sourceUrl: item.commons_page_url ?? null,
      author: item.author ?? null,
      license: item.license ?? null,
      licenseUrl: item.license_url ?? null,
    };
  });
  return { verifiedAt: parsed.verified_at, items };
}

function sourceName(sourceUrl: string | null, fallback: string): string {
  if (!sourceUrl) return fallback;
  const hostname = new URL(sourceUrl).hostname.toLowerCase();
  return hostname === "commons.wikimedia.org" || hostname.endsWith(".commons.wikimedia.org")
    ? "Wikimedia Commons"
    : fallback;
}

export function createProductionRows(
  dataset: NormalizedLocationOutput,
  embeddingManifest: EmbeddingManifest,
  imageLicenses: ImageLicenseCatalog,
): ProductionRows {
  if (dataset.reviewQueue.length > 0) throw new Error("Production data contains unresolved review items");
  const manifestKey = (locationId: string, imageUrl: string) => `${locationId}\u0000${imageUrl}`;
  const embeddingsByLocationAndUrl = new Map(
    embeddingManifest.items.map((item) => [manifestKey(item.location_id, item.image_url), item]),
  );
  if (embeddingsByLocationAndUrl.size !== embeddingManifest.items.length) {
    throw new Error("Embedding manifest contains duplicate location_id and image_url pairs");
  }
  const licensesByImageId = new Map(imageLicenses.items.map((item) => [item.imageId, item]));

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
      source: location.provenance.source,
      source_url: location.provenance.sourceUrl,
      author: null,
      license: null,
      license_url: null,
      last_verified_at: location.provenance.lastVerifiedAt,
    });
    for (const image of location.images) {
      const key = manifestKey(locationId, image.imageUrl);
      const entry = embeddingsByLocationAndUrl.get(key);
      if (!entry) throw new Error(`Image is missing from embedding manifest: ${image.imageUrl}`);
      if (entry.location_id !== locationId) throw new Error(`Image location_id mismatch: ${entry.image_id}`);
      const attribution = licensesByImageId.get(entry.image_id);
      if (!attribution) throw new Error(`Image is missing from license catalog: ${entry.image_id}`);
      if (attribution.locationId !== locationId) throw new Error(`Image license location_id mismatch: ${entry.image_id}`);
      images.push({
        id: entry.image_id,
        location_id: locationId,
        image_url: image.imageUrl,
        alt: image.alt,
        source: sourceName(attribution.sourceUrl, entry.source),
        source_url: attribution.sourceUrl,
        author: attribution.author,
        license: attribution.license,
        license_url: attribution.licenseUrl,
        last_verified_at: imageLicenses.verifiedAt,
      });
      embeddingsByLocationAndUrl.delete(key);
      licensesByImageId.delete(entry.image_id);
    }
  }
  if (embeddingsByLocationAndUrl.size > 0) {
    throw new Error(`Embedding manifest contains ${embeddingsByLocationAndUrl.size} image(s) absent from location data`);
  }
  if (licensesByImageId.size > 0) {
    throw new Error(`Image license catalog contains ${licensesByImageId.size} image(s) absent from location data`);
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
  preserveExisting = false,
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
  const locationIds = new Set(existingLocationIds);
  const imageIds = new Set(existingImages.map((image) => image.id));
  const locationsToWrite = preserveExisting ? rows.locations.filter((row) => !locationIds.has(row.id)) : rows.locations;
  const imagesToWrite = preserveExisting ? rows.images.filter((row) => !imageIds.has(row.id)) : rows.images;
  for (const batch of chunks(locationsToWrite, batchSize)) await database.upsertLocations(batch);
  for (const batch of chunks(imagesToWrite, batchSize)) await database.upsertImages(batch);
  return {
    ...base,
    existingLocations: existingLocationIds.length,
    existingImages: existingImages.length,
    locationsWritten: locationsToWrite.length,
    imagesWritten: imagesToWrite.length,
  };
}
