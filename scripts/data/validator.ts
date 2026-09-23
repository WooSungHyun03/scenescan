import { z } from "zod";

const categories = new Set(["urban", "nature", "industrial", "interior"]);
const regions = new Set(["서울", "부산", "인천", "경기"]);
const uuidSchema = z.string().uuid();

type JsonObject = Record<string, unknown>;

export type ImagePathStatus = "ok" | "missing" | "not-file" | "unreadable";

export type DataValidationErrorCode =
  | "DATASET_INVALID"
  | "SCHEMA_VERSION_INVALID"
  | "SOURCE_INVALID"
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
  | "SOURCE_URL_INVALID"
  | "IMAGES_REQUIRED"
  | "IMAGE_INVALID"
  | "IMAGE_URL_INVALID"
  | "IMAGE_ALT_REQUIRED"
  | "IMAGE_PATH_REQUIRED"
  | "IMAGE_PATH_NOT_FOUND"
  | "IMAGE_PATH_NOT_FILE"
  | "IMAGE_PATH_UNREADABLE";

export type DataValidationError = {
  code: DataValidationErrorCode;
  locationIndex: number | null;
  locationId: string | null;
  field: string;
  message: string;
};

export type DataValidationReport = {
  schemaVersion: 1;
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
  inspectImagePath: (imagePath: string) => Promise<ImagePathStatus>;
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

  const status = await options.inspectImagePath(imagePath);
  if (status === "missing") {
    errors.push(error("IMAGE_PATH_NOT_FOUND", locationIndex, locationId, `${prefix}.imagePath`, `Image file does not exist: ${imagePath}`));
  } else if (status === "not-file") {
    errors.push(error("IMAGE_PATH_NOT_FILE", locationIndex, locationId, `${prefix}.imagePath`, `Image path is not a regular file: ${imagePath}`));
  } else if (status === "unreadable") {
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
    errors.push(error("REGION_UNKNOWN", locationIndex, id, "region", "Region must be 서울, 부산, 인천, or 경기"));
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
  }
  if (!isHttpUrl(value.sourceUrl)) {
    errors.push(error("SOURCE_URL_INVALID", locationIndex, id, "sourceUrl", "Source URL must use HTTP or HTTPS"));
  }

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

function createReport(totalLocations: number, errors: DataValidationError[]): DataValidationReport {
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
    schemaVersion: 1,
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

export async function validateLocationDataset(
  value: unknown,
  options: DataValidationOptions,
): Promise<DataValidationReport> {
  if (!isObject(value)) {
    return createReport(0, [error("DATASET_INVALID", null, null, "$", "Dataset must be an object")]);
  }

  const rootErrors: DataValidationError[] = [];
  if (value.schemaVersion !== 1) {
    rootErrors.push(error("SCHEMA_VERSION_INVALID", null, null, "schemaVersion", "Schema version must be 1"));
  }
  if (!isObject(value.source) || !nonEmptyText(value.source.name)) {
    rootErrors.push(error("SOURCE_INVALID", null, null, "source.name", "Source name is required"));
  }
  if (!Array.isArray(value.locations)) {
    rootErrors.push(error("DATASET_INVALID", null, null, "locations", "Dataset locations must be an array"));
    return createReport(0, rootErrors);
  }

  const results = await Promise.all(
    value.locations.map((location, index) => validateLocation(location, index, options)),
  );
  const errors = [...rootErrors, ...results.flatMap((result) => result.errors)];
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
  return createReport(value.locations.length, errors);
}
