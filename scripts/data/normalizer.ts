import {
  canonicalLocationRecordSchema,
  normalizedLocationOutputSchema,
  type CanonicalLocationRecord,
  type NormalizedLocationOutput,
  type SourceMapping,
} from "./contracts.ts";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function requiredText(record: JsonObject, path: string, label: string): string {
  const value = readPath(record, path);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must resolve to a non-empty string at "${path}"`);
  }
  return value.trim();
}

function optionalText(record: JsonObject, path: string | undefined): string | null {
  if (!path) return null;
  const value = readPath(record, path);
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Optional field must resolve to a string at "${path}"`);
  }
  return value.trim();
}

function coordinate(record: JsonObject, path: string, label: string): number {
  const raw = readPath(record, path);
  const value = typeof raw === "string" && raw.trim().length > 0 ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must resolve to a finite number at "${path}"`);
  }
  return value;
}

function mappedValue<T extends string>(
  record: JsonObject,
  path: string,
  mapping: Readonly<Record<string, T>>,
  allowedValues: readonly T[],
  label: string,
): T {
  const rawValue = readPath(record, path);
  const raw = typeof rawValue === "number" && Number.isFinite(rawValue)
    ? String(rawValue)
    : typeof rawValue === "string" && rawValue.trim().length > 0
      ? rawValue.trim()
      : undefined;
  if (!raw) throw new Error(`${label} must resolve to a non-empty string or finite number at "${path}"`);
  const mapped = mapping[raw] ?? (allowedValues.includes(raw as T) ? raw as T : undefined);
  if (!mapped) {
    throw new Error(`${label} value "${raw}" is not canonical and has no mapping`);
  }
  return mapped;
}

function imageRecords(record: JsonObject, mapping: SourceMapping["images"], name: string): CanonicalLocationRecord["images"] {
  if (!mapping) return [];
  const raw = readPath(record, mapping.path);
  if (raw === undefined || raw === null) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item, index) => {
    let imageUrl: unknown;
    let alt: unknown;
    let imagePath: unknown;
    if (mapping.url) {
      imageUrl = readPath(item, mapping.url);
      alt = mapping.alt ? readPath(item, mapping.alt) : undefined;
      imagePath = mapping.localPath ? readPath(item, mapping.localPath) : undefined;
    } else {
      imageUrl = item;
    }
    if (typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
      throw new Error(`images[${index}].imageUrl must be a non-empty string`);
    }
    if (alt !== undefined && alt !== null && typeof alt !== "string") {
      throw new Error(`images[${index}].alt must be a string`);
    }
    if (imagePath !== undefined && imagePath !== null && (typeof imagePath !== "string" || imagePath.trim().length === 0)) {
      throw new Error(`images[${index}].imagePath must be a non-empty string`);
    }
    const normalizedAlt = typeof alt === "string" && alt.trim().length > 0 ? alt.trim() : name;
    return {
      ...(typeof imagePath === "string" ? { imagePath: imagePath.trim() } : {}),
      imageUrl: imageUrl.trim(),
      alt: normalizedAlt,
    };
  });
}

function rawRecords(raw: unknown, recordsPath: string | undefined): unknown[] {
  const value = recordsPath ? readPath(raw, recordsPath) : raw;
  if (!Array.isArray(value)) {
    const location = recordsPath ? ` at "${recordsPath}"` : " at the document root";
    throw new Error(`Raw dataset must contain an array${location}`);
  }
  if (value.length === 0) throw new Error("Raw dataset must contain at least one location");
  return value;
}

export function normalizeRecord(record: unknown, mapping: SourceMapping): CanonicalLocationRecord {
  if (!isObject(record)) throw new Error("Raw location must be an object");

  const name = requiredText(record, mapping.fields.name, "name");
  const id = optionalText(record, mapping.fields.id);
  const description = optionalText(record, mapping.fields.description) ?? mapping.defaults.description;
  const sourceUrl = optionalText(record, mapping.fields.sourceUrl) ?? mapping.source.defaultSourceUrl;
  if (!sourceUrl) {
    throw new Error("sourceUrl is required; map a record field or configure source.defaultSourceUrl");
  }

  const normalized: CanonicalLocationRecord = {
    ...(id ? { id } : {}),
    name,
    description,
    category: mappedValue(
      record,
      mapping.fields.category,
      mapping.categoryMap,
      ["urban", "nature", "industrial", "interior"],
      "category",
    ),
    region: mappedValue(
      record,
      mapping.fields.region,
      mapping.regionMap,
      ["서울", "부산", "인천", "경기"],
      "region",
    ),
    address: requiredText(record, mapping.fields.address, "address"),
    latitude: coordinate(record, mapping.fields.latitude, "latitude"),
    longitude: coordinate(record, mapping.fields.longitude, "longitude"),
    permit: {
      type: optionalText(record, mapping.permit.type) ?? mapping.defaults.permitType,
      contactName: optionalText(record, mapping.permit.contactName),
      contactPhone: optionalText(record, mapping.permit.contactPhone),
      note: optionalText(record, mapping.permit.note),
    },
    images: imageRecords(record, mapping.images, name),
    sourceUrl,
  };

  return canonicalLocationRecordSchema.parse(normalized);
}

export function normalizeDataset(raw: unknown, mapping: SourceMapping): NormalizedLocationOutput {
  const locations = rawRecords(raw, mapping.recordsPath).map((record, index) => {
    try {
      return normalizeRecord(record, mapping);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to normalize raw record ${index}: ${message}`, { cause: error });
    }
  });

  return normalizedLocationOutputSchema.parse({
    schemaVersion: 1,
    source: { name: mapping.source.name },
    locations,
  });
}
