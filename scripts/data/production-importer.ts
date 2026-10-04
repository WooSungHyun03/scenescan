import type { NormalizedLocationOutput } from "./contracts.ts";
import { z } from "zod";
import type { NoiseSource } from "../../src/types/domain.ts";
import { distanceMeters, MAX_NEARBY_PARKING_DISTANCE_METERS } from "./static-parking.ts";

export type ProductionImportMode = "validate-only" | "dry-run" | "apply";
export type ProductionWriteScope = "all" | "attribution-only" | "permit-only" | "parking-only" | "noise-only";

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
  permit_source: string;
  permit_source_url: string;
  permit_reference_date: string | null;
  permit_last_verified_at: string | null;
  noise_sources: NoiseSource[];
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

export type ParkingRow = {
  location_id: string;
  relationship: "on_site" | "nearby";
  name: string;
  latitude: number;
  longitude: number;
  capacity: number | null;
  opening_hours: string | null;
  price_info: string | null;
  source: string;
  source_url: string;
  reference_date: string | null;
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
    filename: string | null;
    localSha256: string | null;
    localBytes: number | null;
  }>;
};

export type ProductionEmbeddingManifest = {
  schema_version: 1;
  items: Array<{
    image_id: string;
    location_id: string;
    image_path: string;
    image_url: string;
    source: string;
    source_url: string;
  }>;
};

export type ProductionRows = { locations: LocationRow[]; images: ImageMetadataRow[]; parking: ParkingRow[] };
export type ExistingImageMetadata = { id: string; location_id: string };
export type ExistingParkingKey = { location_id: string; name: string };
export type LocationAttributionRow = Pick<
  LocationRow,
  "id" | "source" | "source_url" | "author" | "license" | "license_url" | "last_verified_at"
>;
export type ImageAttributionRow = Pick<
  ImageMetadataRow,
  "id" | "source" | "source_url" | "author" | "license" | "license_url" | "last_verified_at"
>;
export type PermitMetadataRow = Pick<
  LocationRow,
  | "id"
  | "permit_type"
  | "contact_name"
  | "contact_phone"
  | "permit_note"
  | "permit_source"
  | "permit_source_url"
  | "permit_reference_date"
  | "permit_last_verified_at"
>;
export type NoiseSourceMetadataRow = Pick<LocationRow, "id" | "noise_sources">;

export interface ProductionImportDatabase {
  findLocationIds(ids: string[]): Promise<string[]>;
  findExistingImages(ids: string[]): Promise<ExistingImageMetadata[]>;
  findExistingParkingKeys(locationIds: string[]): Promise<ExistingParkingKey[]>;
  upsertLocations(rows: LocationRow[]): Promise<void>;
  upsertImages(rows: ImageMetadataRow[]): Promise<void>;
  upsertParking(rows: ParkingRow[]): Promise<void>;
  updateLocationAttribution(rows: LocationAttributionRow[]): Promise<void>;
  updateImageAttribution(rows: ImageAttributionRow[]): Promise<void>;
  updatePermitMetadata(rows: PermitMetadataRow[]): Promise<void>;
  updateNoiseSources(rows: NoiseSourceMetadataRow[]): Promise<void>;
}

export type ProductionImportResult = {
  mode: ProductionImportMode;
  writeScope: ProductionWriteScope;
  locationsValidated: number;
  imagesValidated: number;
  parkingValidated: number;
  noiseSourcesValidated: number;
  existingLocations: number;
  existingImages: number;
  existingParking: number;
  locationsWritten: number;
  imagesWritten: number;
  parkingWritten: number;
};

export function toLocationAttributionRow(row: LocationRow): LocationAttributionRow {
  return {
    id: row.id,
    source: row.source,
    source_url: row.source_url,
    author: row.author,
    license: row.license,
    license_url: row.license_url,
    last_verified_at: row.last_verified_at,
  };
}

export function toImageAttributionRow(row: ImageMetadataRow): ImageAttributionRow {
  return {
    id: row.id,
    source: row.source,
    source_url: row.source_url,
    author: row.author,
    license: row.license,
    license_url: row.license_url,
    last_verified_at: row.last_verified_at,
  };
}

export function toPermitMetadataRow(row: LocationRow): PermitMetadataRow {
  return {
    id: row.id,
    permit_type: row.permit_type,
    contact_name: row.contact_name,
    contact_phone: row.contact_phone,
    permit_note: row.permit_note,
    permit_source: row.permit_source,
    permit_source_url: row.permit_source_url,
    permit_reference_date: row.permit_reference_date,
    permit_last_verified_at: row.permit_last_verified_at,
  };
}

export function toNoiseSourceMetadataRow(row: LocationRow): NoiseSourceMetadataRow {
  return { id: row.id, noise_sources: row.noise_sources };
}

function hasReviewedPermitMetadata(row: LocationRow): boolean {
  return row.permit_type !== "문의 필요"
    || row.contact_name !== null
    || row.contact_phone !== null
    || row.permit_source_url !== row.source_url;
}

function requiredId(id: string | undefined, label: string): string {
  if (!id) throw new Error(`${label} requires a stable UUID before production import`);
  return id;
}

const optionalText = z.string().trim().min(1).nullable().optional();
const httpUrl = z.string().trim().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);
const optionalHttpUrl = httpUrl.nullable().optional();

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
    filename: optionalText,
    local_sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    local_bytes: z.number().int().positive().nullable().optional(),
  }).passthrough()),
}).strict();

const productionEmbeddingManifestSchema = z.object({
  schema_version: z.literal(1),
  items: z.array(z.object({
    image_id: z.string().uuid(),
    location_id: z.string().uuid(),
    image_path: z.string().trim().min(1),
    image_url: httpUrl,
    source: z.string().trim().min(1),
    source_url: httpUrl,
  }).strict()).min(1),
}).strict();

export function parseProductionEmbeddingManifest(value: unknown): ProductionEmbeddingManifest {
  const parsed = productionEmbeddingManifestSchema.parse(value);
  const seen = new Set<string>();
  for (const item of parsed.items) {
    if (seen.has(item.image_id)) throw new Error(`Embedding manifest contains duplicate image_id: ${item.image_id}`);
    seen.add(item.image_id);
  }
  return parsed;
}

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
      filename: item.filename ?? null,
      localSha256: item.local_sha256 ?? null,
      localBytes: item.local_bytes ?? null,
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
  embeddingManifest: ProductionEmbeddingManifest,
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
  const parking: ParkingRow[] = [];
  for (const location of dataset.locations) {
    const locationId = requiredId(location.id, `Location ${location.name}`);
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
      permit_source: location.permit.provenance.source,
      permit_source_url: location.permit.provenance.sourceUrl,
      permit_reference_date: location.permit.provenance.referenceDate,
      permit_last_verified_at: location.permit.provenance.lastVerifiedAt,
      noise_sources: location.noiseSources.map((source) => ({
        kind: source.kind,
        description: source.description,
        distanceMeters: source.distanceMeters,
        evidence: source.evidence,
        source: source.provenance.source,
        sourceUrl: source.provenance.sourceUrl,
        license: source.license,
        licenseUrl: source.licenseUrl,
        referenceDate: source.provenance.referenceDate,
        lastVerifiedAt: source.provenance.lastVerifiedAt,
      })),
      source: location.provenance.source,
      source_url: location.provenance.sourceUrl,
      author: null,
      license: null,
      license_url: null,
      last_verified_at: location.provenance.lastVerifiedAt,
    });
    for (const item of location.parking) {
      if (!item.provenance.referenceDate && !item.provenance.lastVerifiedAt) {
        throw new Error(`Parking record requires a reference or verification date: ${item.name}`);
      }
      const distance = distanceMeters(location, item);
      const maximumDistance = item.relationship === "on_site" ? 300 : MAX_NEARBY_PARKING_DISTANCE_METERS;
      if (distance > maximumDistance) {
        throw new Error(
          `${item.name} is ${Math.round(distance)}m from ${location.name}; ${item.relationship} limit is ${maximumDistance}m`,
        );
      }
      parking.push({
        location_id: locationId,
        relationship: item.relationship,
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        capacity: item.capacity,
        opening_hours: item.openingHours,
        price_info: item.priceInfo,
        source: item.provenance.source,
        source_url: item.provenance.sourceUrl,
        reference_date: item.provenance.referenceDate,
        last_verified_at: item.provenance.lastVerifiedAt,
      });
    }
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
  const parkingKeys = new Set<string>();
  const physicalParkingKeys = new Set<string>();
  for (const item of parking) {
    const key = `${item.location_id}\u0000${item.name}`;
    if (parkingKeys.has(key)) throw new Error(`Production data contains duplicate parking key: ${item.name}`);
    parkingKeys.add(key);
    const physicalKey = `${item.name.trim().toLocaleLowerCase("ko-KR")}\u0000${item.latitude.toFixed(6)}\u0000${item.longitude.toFixed(6)}`;
    if (physicalParkingKeys.has(physicalKey)) {
      throw new Error(`Production data assigns the same physical parking more than once: ${item.name}`);
    }
    physicalParkingKeys.add(physicalKey);
  }
  return { locations, images, parking };
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
  writeScope: ProductionWriteScope = "all",
): Promise<ProductionImportResult> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("import batch size must be an integer between 1 and 500");
  }
  if (preserveExisting && writeScope !== "all") {
    throw new Error("--insert-only cannot be combined with a partial write scope");
  }
  const base = {
    mode,
    writeScope,
    locationsValidated: rows.locations.length,
    imagesValidated: rows.images.length,
    parkingValidated: rows.parking.length,
    noiseSourcesValidated: rows.locations.reduce((count, row) => count + row.noise_sources.length, 0),
    existingLocations: 0,
    existingImages: 0,
    existingParking: 0,
    locationsWritten: 0,
    imagesWritten: 0,
    parkingWritten: 0,
  };
  if (mode === "validate-only") return base;
  if (!database) throw new Error(`Database connection is required for ${mode}`);

  const existingLocationIds: string[] = [];
  for (const batch of chunks(rows.locations.map((row) => row.id), batchSize)) {
    existingLocationIds.push(...await database.findLocationIds(batch));
  }
  if (writeScope === "permit-only") {
    if (mode === "dry-run") {
      return { ...base, existingLocations: existingLocationIds.length };
    }
    const locationIds = new Set(existingLocationIds);
    const permitRows = rows.locations
      .filter((row) => locationIds.has(row.id) && hasReviewedPermitMetadata(row))
      .map(toPermitMetadataRow);
    for (const batch of chunks(permitRows, batchSize)) await database.updatePermitMetadata(batch);
    return {
      ...base,
      existingLocations: existingLocationIds.length,
      locationsWritten: permitRows.length,
    };
  }
  if (writeScope === "noise-only") {
    if (mode === "dry-run") {
      return { ...base, existingLocations: existingLocationIds.length };
    }
    const existingLocationSet = new Set(existingLocationIds);
    const noiseRows = rows.locations
      .filter((row) => existingLocationSet.has(row.id) && row.noise_sources.length > 0)
      .map(toNoiseSourceMetadataRow);
    for (const batch of chunks(noiseRows, batchSize)) await database.updateNoiseSources(batch);
    return {
      ...base,
      existingLocations: existingLocationIds.length,
      locationsWritten: noiseRows.length,
    };
  }
  const parkingLocationIds = [...new Set(rows.parking.map((row) => row.location_id))];
  const existingParking: ExistingParkingKey[] = [];
  if (writeScope === "all" || writeScope === "parking-only") {
    for (const batch of chunks(parkingLocationIds, batchSize)) {
      existingParking.push(...await database.findExistingParkingKeys(batch));
    }
  }
  const existingParkingKeys = new Set(existingParking.map((row) => `${row.location_id}\u0000${row.name}`));
  if (writeScope === "parking-only") {
    const existingLocationSet = new Set(existingLocationIds);
    const missingLocationIds = parkingLocationIds.filter((id) => !existingLocationSet.has(id));
    if (missingLocationIds.length > 0) {
      throw new Error(`Parking import references ${missingLocationIds.length} location(s) absent from Supabase`);
    }
    if (mode === "dry-run") {
      return { ...base, existingLocations: existingLocationIds.length, existingParking: existingParking.length };
    }
    for (const batch of chunks(rows.parking, batchSize)) await database.upsertParking(batch);
    return {
      ...base,
      existingLocations: existingLocationIds.length,
      existingParking: existingParking.length,
      parkingWritten: rows.parking.length,
    };
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
    return {
      ...base,
      existingLocations: existingLocationIds.length,
      existingImages: existingImages.length,
      existingParking: existingParking.length,
    };
  }
  const locationIds = new Set(existingLocationIds);
  const imageIds = new Set(existingImages.map((image) => image.id));
  if (writeScope === "attribution-only") {
    const locationAttribution = rows.locations
      .filter((row) => locationIds.has(row.id))
      .map(toLocationAttributionRow);
    const imageAttribution = rows.images
      .filter((row) => imageIds.has(row.id))
      .map(toImageAttributionRow);
    for (const batch of chunks(locationAttribution, batchSize)) await database.updateLocationAttribution(batch);
    for (const batch of chunks(imageAttribution, batchSize)) await database.updateImageAttribution(batch);
    return {
      ...base,
      existingLocations: existingLocationIds.length,
      existingImages: existingImages.length,
      locationsWritten: locationAttribution.length,
      imagesWritten: imageAttribution.length,
    };
  }
  const locationsToWrite = preserveExisting ? rows.locations.filter((row) => !locationIds.has(row.id)) : rows.locations;
  const imagesToWrite = preserveExisting ? rows.images.filter((row) => !imageIds.has(row.id)) : rows.images;
  const parkingToWrite = preserveExisting
    ? rows.parking.filter((row) => !existingParkingKeys.has(`${row.location_id}\u0000${row.name}`))
    : rows.parking;
  for (const batch of chunks(locationsToWrite, batchSize)) await database.upsertLocations(batch);
  for (const batch of chunks(parkingToWrite, batchSize)) await database.upsertParking(batch);
  for (const batch of chunks(imagesToWrite, batchSize)) await database.upsertImages(batch);
  return {
    ...base,
    existingLocations: existingLocationIds.length,
    existingImages: existingImages.length,
    existingParking: existingParking.length,
    locationsWritten: locationsToWrite.length,
    imagesWritten: imagesToWrite.length,
    parkingWritten: parkingToWrite.length,
  };
}
