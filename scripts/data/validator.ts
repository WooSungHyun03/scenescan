import { z } from "zod";
import { basename } from "node:path";
import { isPermitGuidance, isValidContactPhone } from "./permit-information.ts";
import { LOCATION_CATEGORY_VALUES, REGION_VALUES } from "../../src/types/location-options.ts";
import { isNoiseSourceVerificationStale } from "../../src/domains/locations/services/noise-source.ts";
import {
  parseImageLicenseCatalog,
  type ImageLicenseCatalog,
} from "./production-importer.ts";

const categories = new Set<string>(LOCATION_CATEGORY_VALUES);
const regions = new Set<string>(REGION_VALUES);
const uuidSchema = z.string().uuid();
const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const httpUrlSchema = z.string().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);
const embeddingManifestSchema = z.object({
  schema_version: z.literal(1),
  items: z.array(z.object({
    image_id: z.string().uuid(),
    location_id: z.string().uuid(),
    image_path: z.string().trim().min(1),
    image_url: httpUrlSchema,
    source: z.string().trim().min(1),
    source_url: httpUrlSchema,
  }).strict()).min(1),
}).strict();

type EmbeddingManifest = z.infer<typeof embeddingManifestSchema>;

type JsonObject = Record<string, unknown>;

export type ImagePathStatus = "ok" | "missing" | "not-file" | "unreadable";
export type ImagePathInspection = {
  status: ImagePathStatus;
  bytes?: number;
  sha256?: string;
};
export type DataValidationMode = "metadata-only" | "require-local-assets";

export type DataValidationErrorCode =
  | "DATASET_INVALID"
  | "SCHEMA_VERSION_INVALID"
  | "SOURCE_INVALID"
  | "CATEGORY_REVIEW_REQUIRED"
  | "LOCATION_INVALID"
  | "LOCATION_ID_REQUIRED"
  | "LOCATION_ID_INVALID"
  | "LOCATION_ID_DUPLICATE"
  | "NAME_REQUIRED"
  | "CATEGORY_UNKNOWN"
  | "REGION_UNKNOWN"
  | "ADDRESS_REQUIRED"
  | "LATITUDE_INVALID"
  | "LONGITUDE_INVALID"
  | "PERMIT_INVALID"
  | "PERMIT_GUIDANCE_UNSAFE"
  | "PERMIT_CONTACT_INVALID"
  | "PROVENANCE_INVALID"
  | "PARKING_INVALID"
  | "PARKING_DUPLICATE"
  | "NOISE_SOURCE_INVALID"
  | "NOISE_SOURCE_DUPLICATE"
  | "NOISE_SOURCE_STALE"
  | "SOURCE_URL_INVALID"
  | "IMAGES_REQUIRED"
  | "IMAGE_INVALID"
  | "IMAGE_URL_INVALID"
  | "IMAGE_ALT_REQUIRED"
  | "IMAGE_PATH_REQUIRED"
  | "IMAGE_PATH_NOT_FOUND"
  | "IMAGE_PATH_NOT_FILE"
  | "IMAGE_PATH_UNREADABLE"
  | "IMAGE_SIZE_MISMATCH"
  | "IMAGE_CHECKSUM_MISMATCH"
  | "EMBEDDING_MANIFEST_INVALID"
  | "LICENSE_MANIFEST_INVALID"
  | "IMAGE_METADATA_MISMATCH";

export type DataValidationError = {
  code: DataValidationErrorCode;
  locationIndex: number | null;
  locationId: string | null;
  field: string;
  message: string;
};

export type DataValidationReport = {
  schemaVersion: 2;
  mode: DataValidationMode;
  valid: boolean;
  summary: {
    totalLocations: number;
    validLocations: number;
    invalidLocations: number;
    errorCount: number;
  };
  errors: DataValidationError[];
};

export type DataValidationOptions = {
  mode: DataValidationMode;
  inspectImagePath?: (imagePath: string) => Promise<ImagePathStatus | ImagePathInspection>;
  embeddingManifest?: unknown;
  imageLicenses?: unknown;
  now?: Date;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isHttpUrl(value: unknown): boolean {
  const text = nonEmptyText(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeInspection(value: ImagePathStatus | ImagePathInspection): ImagePathInspection {
  return typeof value === "string" ? { status: value } : value;
}

function error(
  code: DataValidationErrorCode,
  locationIndex: number | null,
  locationId: string | null,
  field: string,
  message: string,
): DataValidationError {
  return { code, locationIndex, locationId, field, message };
}

function coordinateError(
  value: unknown,
  minimum: number,
  maximum: number,
  code: "LATITUDE_INVALID" | "LONGITUDE_INVALID",
  locationIndex: number,
  locationId: string | null,
  field: "latitude" | "longitude",
): DataValidationError | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum) return null;
  return error(code, locationIndex, locationId, field, `${field} must be a finite number between ${minimum} and ${maximum}`);
}

function validateProvenance(
  value: unknown,
  field: string,
  locationIndex: number,
  locationId: string | null,
): DataValidationError[] {
  if (!isObject(value)) {
    return [error(
      "PROVENANCE_INVALID",
      locationIndex,
      locationId,
      field,
      "Provenance must include source, sourceUrl, referenceDate, and lastVerifiedAt",
    )];
  }
  const errors: DataValidationError[] = [];
  if (!nonEmptyText(value.source)) {
    errors.push(error("PROVENANCE_INVALID", locationIndex, locationId, `${field}.source`, "Provenance source is required"));
  }
  if (!isHttpUrl(value.sourceUrl)) {
    errors.push(error(
      "PROVENANCE_INVALID",
      locationIndex,
      locationId,
      `${field}.sourceUrl`,
      "Provenance source URL must use HTTP or HTTPS",
    ));
  }
  if (value.referenceDate !== null && !isoDateSchema.safeParse(value.referenceDate).success) {
    errors.push(error(
      "PROVENANCE_INVALID",
      locationIndex,
      locationId,
      `${field}.referenceDate`,
      "Provenance reference date must be YYYY-MM-DD or null",
    ));
  }
  if (value.lastVerifiedAt !== null && !isoDateTimeSchema.safeParse(value.lastVerifiedAt).success) {
    errors.push(error(
      "PROVENANCE_INVALID",
      locationIndex,
      locationId,
      `${field}.lastVerifiedAt`,
      "Provenance last verified value must be an ISO 8601 timestamp with timezone or null",
    ));
  }
  return errors;
}

function validateParking(
  value: unknown,
  parkingIndex: number,
  locationIndex: number,
  locationId: string | null,
): DataValidationError[] {
  const field = `parking[${parkingIndex}]`;
  if (!isObject(value)) {
    return [error("PARKING_INVALID", locationIndex, locationId, field, "Parking entry must be an object")];
  }
  const errors: DataValidationError[] = [];
  if (value.relationship !== "on_site" && value.relationship !== "nearby") {
    errors.push(error(
      "PARKING_INVALID",
      locationIndex,
      locationId,
      `${field}.relationship`,
      "Parking relationship must be on_site or nearby",
    ));
  }
  if (!nonEmptyText(value.name)) {
    errors.push(error("PARKING_INVALID", locationIndex, locationId, `${field}.name`, "Parking name is required"));
  }
  const latitudeError = coordinateError(
    value.latitude,
    -90,
    90,
    "LATITUDE_INVALID",
    locationIndex,
    locationId,
    "latitude",
  );
  if (latitudeError) errors.push({ ...latitudeError, field: `${field}.latitude` });
  const longitudeError = coordinateError(
    value.longitude,
    -180,
    180,
    "LONGITUDE_INVALID",
    locationIndex,
    locationId,
    "longitude",
  );
  if (longitudeError) errors.push({ ...longitudeError, field: `${field}.longitude` });
  if (value.capacity !== null && (
    typeof value.capacity !== "number" || !Number.isInteger(value.capacity) || value.capacity < 0
  )) {
    errors.push(error(
      "PARKING_INVALID",
      locationIndex,
      locationId,
      `${field}.capacity`,
      "Parking capacity must be a non-negative integer or null",
    ));
  }
  for (const key of ["openingHours", "priceInfo"] as const) {
    if (value[key] !== null && !nonEmptyText(value[key])) {
      errors.push(error(
        "PARKING_INVALID",
        locationIndex,
        locationId,
        `${field}.${key}`,
        `${key} must be a non-empty source value or null`,
      ));
    }
  }
  errors.push(...validateProvenance(value.provenance, `${field}.provenance`, locationIndex, locationId));
  return errors;
}

function validateNoiseSource(
  value: unknown,
  noiseIndex: number,
  locationIndex: number,
  locationId: string | null,
  now: Date,
): DataValidationError[] {
  const field = `noiseSources[${noiseIndex}]`;
  if (!isObject(value)) {
    return [error("NOISE_SOURCE_INVALID", locationIndex, locationId, field, "Noise source must be a structured object")];
  }
  const errors: DataValidationError[] = [];
  if (!["railway", "major_road", "airport", "construction"].includes(String(value.kind))) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, `${field}.kind`, "Noise source kind is not supported"));
  }
  if (!nonEmptyText(value.description)) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, `${field}.description`, "Noise source description is required"));
  }
  const distanceValid = value.distanceMeters === null
    || (typeof value.distanceMeters === "number" && Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0);
  if (!distanceValid) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, `${field}.distanceMeters`, "Noise source distance must be a non-negative finite number or null"));
  }
  const evidence = value.evidence === null ? null : nonEmptyText(value.evidence);
  if (value.evidence !== null && !evidence) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, `${field}.evidence`, "Noise source evidence must be non-empty or null"));
  }
  if (value.distanceMeters === null && !evidence) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, field, "Noise source requires a distance or evidence"));
  }
  if (!nonEmptyText(value.license) || !isHttpUrl(value.licenseUrl)) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, `${field}.license`, "Noise source requires an explicit license and HTTP(S) license URL"));
  }
  errors.push(...validateProvenance(value.provenance, `${field}.provenance`, locationIndex, locationId));
  if (!isObject(value.provenance) || !isoDateTimeSchema.safeParse(value.provenance.lastVerifiedAt).success) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, locationId, `${field}.provenance.lastVerifiedAt`, "Noise source requires a valid verification timestamp"));
  } else if (isNoiseSourceVerificationStale(String(value.provenance.lastVerifiedAt), now)) {
    errors.push(error("NOISE_SOURCE_STALE", locationIndex, locationId, `${field}.provenance.lastVerifiedAt`, "Noise source verification is older than 365 days"));
  }
  return errors;
}

async function validateImage(
  value: unknown,
  imageIndex: number,
  locationIndex: number,
  locationId: string | null,
  options: DataValidationOptions,
): Promise<DataValidationError[]> {
  const prefix = `images[${imageIndex}]`;
  if (!isObject(value)) {
    return [error("IMAGE_INVALID", locationIndex, locationId, prefix, "Image entry must be an object")];
  }

  const errors: DataValidationError[] = [];
  if (!isHttpUrl(value.imageUrl)) {
    errors.push(error("IMAGE_URL_INVALID", locationIndex, locationId, `${prefix}.imageUrl`, "Image URL must use HTTP or HTTPS"));
  }
  if (!nonEmptyText(value.alt)) {
    errors.push(error("IMAGE_ALT_REQUIRED", locationIndex, locationId, `${prefix}.alt`, "Image alt text is required"));
  }

  const imagePath = nonEmptyText(value.imagePath);
  if (!imagePath) {
    errors.push(error("IMAGE_PATH_REQUIRED", locationIndex, locationId, `${prefix}.imagePath`, "Local image path is required before import"));
    return errors;
  }

  if (options.mode === "metadata-only") return errors;
  if (!options.inspectImagePath) {
    throw new Error("require-local-assets validation requires an image path inspector");
  }

  const inspection = normalizeInspection(await options.inspectImagePath(imagePath));
  if (inspection.status === "missing") {
    errors.push(error("IMAGE_PATH_NOT_FOUND", locationIndex, locationId, `${prefix}.imagePath`, `Image file does not exist: ${imagePath}`));
  } else if (inspection.status === "not-file") {
    errors.push(error("IMAGE_PATH_NOT_FILE", locationIndex, locationId, `${prefix}.imagePath`, `Image path is not a regular file: ${imagePath}`));
  } else if (inspection.status === "unreadable") {
    errors.push(error("IMAGE_PATH_UNREADABLE", locationIndex, locationId, `${prefix}.imagePath`, `Image path could not be inspected: ${imagePath}`));
  }
  return errors;
}

async function validateLocation(
  value: unknown,
  locationIndex: number,
  options: DataValidationOptions,
): Promise<{ id: string | null; errors: DataValidationError[] }> {
  if (!isObject(value)) {
    return {
      id: null,
      errors: [error("LOCATION_INVALID", locationIndex, null, "locations", "Location entry must be an object")],
    };
  }

  const errors: DataValidationError[] = [];
  const id = nonEmptyText(value.id);
  if (!id) {
    errors.push(error("LOCATION_ID_REQUIRED", locationIndex, null, "id", "Location ID is required before import"));
  } else if (!uuidSchema.safeParse(id).success) {
    errors.push(error("LOCATION_ID_INVALID", locationIndex, id, "id", "Location ID must be a UUID"));
  }
  if (!nonEmptyText(value.name)) {
    errors.push(error("NAME_REQUIRED", locationIndex, id, "name", "Location name must not be blank"));
  }
  if (typeof value.category !== "string" || !categories.has(value.category)) {
    errors.push(error("CATEGORY_UNKNOWN", locationIndex, id, "category", "Category must be urban, nature, industrial, or interior"));
  }
  if (typeof value.region !== "string" || !regions.has(value.region)) {
    errors.push(error("REGION_UNKNOWN", locationIndex, id, "region", `Region must be one of: ${REGION_VALUES.join(", ")}`));
  }
  if (!nonEmptyText(value.address)) {
    errors.push(error("ADDRESS_REQUIRED", locationIndex, id, "address", "Location address must not be blank"));
  }
  const latitudeError = coordinateError(value.latitude, -90, 90, "LATITUDE_INVALID", locationIndex, id, "latitude");
  if (latitudeError) errors.push(latitudeError);
  const longitudeError = coordinateError(value.longitude, -180, 180, "LONGITUDE_INVALID", locationIndex, id, "longitude");
  if (longitudeError) errors.push(longitudeError);
  if (!isObject(value.permit) || !nonEmptyText(value.permit.type)) {
    errors.push(error("PERMIT_INVALID", locationIndex, id, "permit", "Permit metadata must include a non-empty type"));
  } else {
    if (!isPermitGuidance(value.permit.type)) {
      errors.push(error(
        "PERMIT_GUIDANCE_UNSAFE",
        locationIndex,
        id,
        "permit.type",
        "Permit guidance must be 문의 필요, 정보 확인 필요, 영상위원회 문의, or 기관 직접 문의",
      ));
    }
    if (value.permit.contactName !== null && !nonEmptyText(value.permit.contactName)) {
      errors.push(error(
        "PERMIT_CONTACT_INVALID",
        locationIndex,
        id,
        "permit.contactName",
        "Permit contact name must be a source string or null; do not generate a fallback contact",
      ));
    }
    if (
      value.permit.contactPhone !== null
      && (!nonEmptyText(value.permit.contactPhone) || !isValidContactPhone(String(value.permit.contactPhone)))
    ) {
      errors.push(error(
        "PERMIT_CONTACT_INVALID",
        locationIndex,
        id,
        "permit.contactPhone",
        "Permit contact phone must be a valid public phone number or null; do not generate a fallback contact",
      ));
    }
    errors.push(...validateProvenance(value.permit.provenance, "permit.provenance", locationIndex, id));
  }
  if (!Array.isArray(value.parking)) {
    errors.push(error("PARKING_INVALID", locationIndex, id, "parking", "Parking data must be an array"));
  } else {
    errors.push(...value.parking.flatMap((parking, index) => validateParking(parking, index, locationIndex, id)));
    const indexesByParkingKey = new Map<string, number[]>();
    value.parking.forEach((parking, index) => {
      if (!isObject(parking)) return;
      const name = nonEmptyText(parking.name)?.toLocaleLowerCase("ko-KR");
      if (!name || typeof parking.latitude !== "number" || typeof parking.longitude !== "number") return;
      const key = `${name}\u0000${parking.latitude.toFixed(6)}\u0000${parking.longitude.toFixed(6)}`;
      indexesByParkingKey.set(key, [...(indexesByParkingKey.get(key) ?? []), index]);
    });
    for (const indexes of indexesByParkingKey.values()) {
      if (indexes.length < 2) continue;
      for (const parkingIndex of indexes) {
        errors.push(error(
          "PARKING_DUPLICATE",
          locationIndex,
          id,
          `parking[${parkingIndex}]`,
          "Duplicate parking name and coordinates within one location",
        ));
      }
    }
  }
  if (value.noiseSources === undefined) {
    // Pre-contract canonical files omitted the field; treat them as no trusted information.
  } else if (!Array.isArray(value.noiseSources)) {
    errors.push(error("NOISE_SOURCE_INVALID", locationIndex, id, "noiseSources", "Noise sources must be an array"));
  } else {
    errors.push(...value.noiseSources.flatMap((source, index) =>
      validateNoiseSource(source, index, locationIndex, id, options.now ?? new Date())
    ));
    const indexesBySourceUrl = new Map<string, number[]>();
    value.noiseSources.forEach((source, index) => {
      if (!isObject(source) || !isObject(source.provenance)) return;
      const sourceUrl = nonEmptyText(source.provenance.sourceUrl);
      if (!sourceUrl) return;
      indexesBySourceUrl.set(sourceUrl, [...(indexesBySourceUrl.get(sourceUrl) ?? []), index]);
    });
    for (const indexes of indexesBySourceUrl.values()) {
      if (indexes.length < 2) continue;
      for (const noiseIndex of indexes) {
        errors.push(error(
          "NOISE_SOURCE_DUPLICATE",
          locationIndex,
          id,
          `noiseSources[${noiseIndex}].provenance.sourceUrl`,
          "Duplicate noise-source URL within one location",
        ));
      }
    }
  }
  if (!isHttpUrl(value.sourceUrl)) {
    errors.push(error("SOURCE_URL_INVALID", locationIndex, id, "sourceUrl", "Source URL must use HTTP or HTTPS"));
  }
  errors.push(...validateProvenance(value.provenance, "provenance", locationIndex, id));

  if (!Array.isArray(value.images) || value.images.length === 0) {
    errors.push(error("IMAGES_REQUIRED", locationIndex, id, "images", "At least one image is required before import"));
  } else {
    const imageErrors = await Promise.all(
      value.images.map((image, imageIndex) => validateImage(image, imageIndex, locationIndex, id, options)),
    );
    errors.push(...imageErrors.flat());
  }
  return { id, errors };
}

function createReport(
  mode: DataValidationMode,
  totalLocations: number,
  errors: DataValidationError[],
): DataValidationReport {
  const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  errors.sort((left, right) => (
    (left.locationIndex ?? -1) - (right.locationIndex ?? -1)
    || compareText(left.field, right.field)
    || compareText(left.code, right.code)
  ));
  const invalidLocationIndexes = new Set(
    errors.flatMap((item) => item.locationIndex === null ? [] : [item.locationIndex]),
  );
  return {
    schemaVersion: 2,
    mode,
    valid: errors.length === 0,
    summary: {
      totalLocations,
      validLocations: totalLocations - invalidLocationIndexes.size,
      invalidLocations: invalidLocationIndexes.size,
      errorCount: errors.length,
    },
    errors,
  };
}

async function productionMetadataErrors(
  value: JsonObject,
  options: DataValidationOptions,
): Promise<DataValidationError[]> {
  if (options.embeddingManifest === undefined && options.imageLicenses === undefined) return [];
  if (options.embeddingManifest === undefined || options.imageLicenses === undefined) {
    return [error(
      "IMAGE_METADATA_MISMATCH",
      null,
      null,
      "productionMetadata",
      "Embedding manifest and image license catalog must be validated together",
    )];
  }

  let manifest: EmbeddingManifest;
  try {
    manifest = embeddingManifestSchema.parse(options.embeddingManifest);
    const imageIds = new Set<string>();
    for (const item of manifest.items) {
      if (imageIds.has(item.image_id)) {
        throw new Error(`Duplicate image_id in manifest: ${item.image_id}`);
      }
      imageIds.add(item.image_id);
    }
  } catch (cause) {
    return [error(
      "EMBEDDING_MANIFEST_INVALID",
      null,
      null,
      "embeddingManifest",
      cause instanceof Error ? cause.message : "Embedding manifest is invalid",
    )];
  }

  let licenses: ImageLicenseCatalog;
  try {
    licenses = parseImageLicenseCatalog(options.imageLicenses);
  } catch (cause) {
    return [error(
      "LICENSE_MANIFEST_INVALID",
      null,
      null,
      "imageLicenses",
      cause instanceof Error ? cause.message : "Image license catalog is invalid",
    )];
  }

  const errors: DataValidationError[] = [];
  const locations = Array.isArray(value.locations) ? value.locations : [];
  const locationIndexById = new Map<string, number>();
  const datasetImageCounts = new Map<string, number>();
  const datasetImagePaths = new Map<string, string>();
  locations.forEach((location, locationIndex) => {
    if (!isObject(location)) return;
    const locationId = nonEmptyText(location.id);
    if (!locationId) return;
    locationIndexById.set(locationId, locationIndex);
    if (!Array.isArray(location.images)) return;
    for (const image of location.images) {
      if (!isObject(image)) continue;
      const imageUrl = nonEmptyText(image.imageUrl);
      if (imageUrl) {
        const key = `${locationId}\u0000${imageUrl}`;
        datasetImageCounts.set(key, (datasetImageCounts.get(key) ?? 0) + 1);
        const imagePath = nonEmptyText(image.imagePath);
        if (imagePath) datasetImagePaths.set(key, imagePath);
      }
    }
  });

  const manifestById = new Map(manifest.items.map((item) => [item.image_id, item]));
  const licenseById = new Map(licenses.items.map((item) => [item.imageId, item]));
  const manifestImageCounts = new Map<string, number>();

  for (const item of manifest.items) {
    const locationIndex = locationIndexById.get(item.location_id) ?? null;
    const key = `${item.location_id}\u0000${item.image_url}`;
    manifestImageCounts.set(key, (manifestImageCounts.get(key) ?? 0) + 1);

    const license = licenseById.get(item.image_id);
    if (!license) {
      errors.push(error(
        "LICENSE_MANIFEST_INVALID",
        locationIndex,
        item.location_id,
        "imageLicenses.items",
        `Image is missing from the license catalog: ${item.image_id}`,
      ));
      continue;
    }
    if (license.locationId !== item.location_id) {
      errors.push(error(
        "IMAGE_METADATA_MISMATCH",
        locationIndex,
        item.location_id,
        "imageLicenses.items.location_id",
        `Image license location does not match the embedding manifest: ${item.image_id}`,
      ));
    }
    if (
      !license.sourceUrl
      || !license.author
      || !license.license
      || !license.licenseUrl
      || !license.filename
      || !license.localSha256
      || !license.localBytes
    ) {
      errors.push(error(
        "LICENSE_MANIFEST_INVALID",
        locationIndex,
        item.location_id,
        "imageLicenses.items",
        `Image license must include source URL, author, license, license URL, filename, local SHA-256, and local byte size: ${item.image_id}`,
      ));
      continue;
    }

    const datasetImagePath = datasetImagePaths.get(key);
    if (datasetImagePath && basename(datasetImagePath) !== license.filename) {
      errors.push(error(
        "IMAGE_METADATA_MISMATCH",
        locationIndex,
        item.location_id,
        "imageLicenses.items.filename",
        `License filename does not match the location image path: ${item.image_id}`,
      ));
    }
    if (options.mode === "require-local-assets" && datasetImagePath && options.inspectImagePath) {
      const inspection = normalizeInspection(await options.inspectImagePath(datasetImagePath));
      if (inspection.status === "ok" && inspection.bytes !== undefined && inspection.bytes !== license.localBytes) {
        errors.push(error(
          "IMAGE_SIZE_MISMATCH",
          locationIndex,
          item.location_id,
          "images.imagePath",
          `Local image byte size differs from the reviewed license manifest: ${datasetImagePath}`,
        ));
      }
      if (inspection.status === "ok" && inspection.sha256 && inspection.sha256 !== license.localSha256) {
        errors.push(error(
          "IMAGE_CHECKSUM_MISMATCH",
          locationIndex,
          item.location_id,
          "images.imagePath",
          `Local image SHA-256 differs from the reviewed license manifest: ${datasetImagePath}`,
        ));
      }
    }
  }

  for (const [key, datasetCount] of datasetImageCounts) {
    const manifestCount = manifestImageCounts.get(key) ?? 0;
    if (datasetCount !== manifestCount) {
      errors.push(error(
        "IMAGE_METADATA_MISMATCH",
        null,
        key.split("\u0000", 1)[0] ?? null,
        "locations.images",
        `Location/embedding image count mismatch: dataset=${datasetCount}, manifest=${manifestCount}`,
      ));
    }
  }
  for (const [key, manifestCount] of manifestImageCounts) {
    if (datasetImageCounts.has(key)) continue;
    errors.push(error(
      "IMAGE_METADATA_MISMATCH",
      null,
      key.split("\u0000", 1)[0] ?? null,
      "embeddingManifest.items",
      `Embedding image is absent from location metadata: manifest=${manifestCount}`,
    ));
  }
  for (const license of licenses.items) {
    if (!manifestById.has(license.imageId)) {
      errors.push(error(
        "LICENSE_MANIFEST_INVALID",
        locationIndexById.get(license.locationId) ?? null,
        license.locationId,
        "imageLicenses.items",
        `License entry is absent from the embedding manifest: ${license.imageId}`,
      ));
    }
  }
  return errors;
}

export async function validateLocationDataset(
  value: unknown,
  options: DataValidationOptions,
): Promise<DataValidationReport> {
  if (!isObject(value)) {
    return createReport(options.mode, 0, [error("DATASET_INVALID", null, null, "$", "Dataset must be an object")]);
  }

  const rootErrors: DataValidationError[] = [];
  if (value.schemaVersion !== 2) {
    rootErrors.push(error("SCHEMA_VERSION_INVALID", null, null, "schemaVersion", "Normalized schema version must be 2"));
  }
  if (!isObject(value.source) || !nonEmptyText(value.source.name)) {
    rootErrors.push(error("SOURCE_INVALID", null, null, "source.name", "Source name is required"));
  }
  if (value.reviewQueue !== undefined && !Array.isArray(value.reviewQueue)) {
    rootErrors.push(error("DATASET_INVALID", null, null, "reviewQueue", "Category review queue must be an array"));
  } else if (Array.isArray(value.reviewQueue) && value.reviewQueue.length > 0) {
    rootErrors.push(error(
      "CATEGORY_REVIEW_REQUIRED",
      null,
      null,
      "reviewQueue",
      `${value.reviewQueue.length} source record(s) require category review before import`,
    ));
  }
  if (!Array.isArray(value.locations)) {
    rootErrors.push(error("DATASET_INVALID", null, null, "locations", "Dataset locations must be an array"));
    return createReport(options.mode, 0, rootErrors);
  }

  const results = await Promise.all(
    value.locations.map((location, index) => validateLocation(location, index, options)),
  );
  const errors = [
    ...rootErrors,
    ...results.flatMap((result) => result.errors),
    ...await productionMetadataErrors(value, options),
  ];
  const indexesById = new Map<string, number[]>();
  results.forEach((result, index) => {
    if (!result.id) return;
    const key = result.id.toLowerCase();
    indexesById.set(key, [...(indexesById.get(key) ?? []), index]);
  });
  for (const [id, indexes] of indexesById) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      errors.push(error(
        "LOCATION_ID_DUPLICATE",
        index,
        results[index].id,
        "id",
        `Location ID appears ${indexes.length} times: ${id}`,
      ));
    }
  }
  return createReport(options.mode, value.locations.length, errors);
}
