import {
  canonicalLocationRecordSchema,
  dataProvenanceSchema,
  normalizedLocationOutputSchema,
  type CanonicalParkingRecord,
  type CategoryReviewItem,
  type CanonicalLocationRecord,
  type DataProvenance,
  type NormalizedLocationOutput,
  type SourceMapping,
} from "./contracts.ts";
import { mapLocationCategory } from "./category-mapping.ts";
import { mapPermitGuidance } from "./permit-information.ts";
import type { LocationCategory } from "../../src/types/domain.ts";

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

function optionalNonNegativeInteger(record: JsonObject, path: string | undefined, label: string): number | null {
  if (!path) return null;
  const raw = readPath(record, path);
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "string" && raw.trim().length > 0 ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must resolve to a non-negative integer at "${path}"`);
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

function referenceText(record: JsonObject, path: string | undefined): string | null {
  if (!path) return null;
  const value = readPath(record, path);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function provenanceRecord(
  record: JsonObject,
  mapping: SourceMapping["provenance"]["location"],
  fallback: DataProvenance,
): DataProvenance {
  return dataProvenanceSchema.parse({
    source: optionalText(record, mapping.source) ?? fallback.source,
    sourceUrl: optionalText(record, mapping.sourceUrl) ?? fallback.sourceUrl,
    referenceDate: optionalText(record, mapping.referenceDate) ?? fallback.referenceDate,
    lastVerifiedAt: optionalText(record, mapping.lastVerifiedAt) ?? fallback.lastVerifiedAt,
  });
}

function parkingRecords(
  record: JsonObject,
  mapping: SourceMapping["parking"],
  fallbackProvenance: DataProvenance,
): CanonicalParkingRecord[] {
  if (!mapping) return [];
  const raw = readPath(record, mapping.path);
  if (raw === undefined || raw === null) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item, index) => {
    if (!isObject(item)) throw new Error(`parking[${index}] must be an object`);
    const id = optionalText(item, mapping.id);
    return {
      ...(id ? { id } : {}),
      name: requiredText(item, mapping.name, `parking[${index}].name`),
      latitude: coordinate(item, mapping.latitude, `parking[${index}].latitude`),
      longitude: coordinate(item, mapping.longitude, `parking[${index}].longitude`),
      capacity: optionalNonNegativeInteger(item, mapping.capacity, `parking[${index}].capacity`),
      openingHours: optionalText(item, mapping.openingHours),
      priceInfo: optionalText(item, mapping.priceInfo),
      provenance: provenanceRecord(item, mapping.provenance, fallbackProvenance),
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

function normalizeRecordWithCategory(
  record: JsonObject,
  mapping: SourceMapping,
  category: LocationCategory,
): CanonicalLocationRecord {
  const name = requiredText(record, mapping.fields.name, "name");
  const id = optionalText(record, mapping.fields.id);
  const description = optionalText(record, mapping.fields.description) ?? mapping.defaults.description;
  const sourceUrl = optionalText(record, mapping.provenance.location.sourceUrl)
    ?? optionalText(record, mapping.fields.sourceUrl)
    ?? mapping.source.defaultSourceUrl;
  if (!sourceUrl) {
    throw new Error(
      "sourceUrl is required; map provenance.location.sourceUrl or fields.sourceUrl, or configure source.defaultSourceUrl",
    );
  }
  const defaultProvenance = dataProvenanceSchema.parse({
    source: mapping.source.name,
    sourceUrl,
    referenceDate: mapping.source.referenceDate ?? null,
    lastVerifiedAt: mapping.source.lastVerifiedAt ?? null,
  });
  const locationProvenance = provenanceRecord(record, mapping.provenance.location, defaultProvenance);

  const normalized: CanonicalLocationRecord = {
    ...(id ? { id } : {}),
    name,
    description,
    category,
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
      type: mapPermitGuidance(
        mapping.permit.type ? readPath(record, mapping.permit.type) : undefined,
        mapping.permitTypeMap,
        mapping.defaults.permitType,
      ),
      contactName: optionalText(record, mapping.permit.contactName),
      contactPhone: optionalText(record, mapping.permit.contactPhone),
      note: optionalText(record, mapping.permit.note),
      provenance: provenanceRecord(record, mapping.provenance.permit, locationProvenance),
    },
    parking: parkingRecords(record, mapping.parking, locationProvenance),
    images: imageRecords(record, mapping.images, name),
    sourceUrl: locationProvenance.sourceUrl,
    provenance: locationProvenance,
  };

  return canonicalLocationRecordSchema.parse(normalized);
}

export function normalizeRecord(record: unknown, mapping: SourceMapping): CanonicalLocationRecord {
  if (!isObject(record)) throw new Error("Raw location must be an object");
  const category = mapLocationCategory(readPath(record, mapping.fields.category), mapping.categoryMap);
  if (category.status === "review") {
    const sourceCategory = category.sourceCategory === null ? "missing or invalid" : `"${category.sourceCategory}"`;
    throw new Error(`category ${sourceCategory} requires review (${category.reason})`);
  }
  return normalizeRecordWithCategory(record, mapping, category.category);
}

export function normalizeDataset(raw: unknown, mapping: SourceMapping): NormalizedLocationOutput {
  const locations: CanonicalLocationRecord[] = [];
  const reviewQueue: CategoryReviewItem[] = [];
  rawRecords(raw, mapping.recordsPath).forEach((record, index) => {
    try {
      if (!isObject(record)) throw new Error("Raw location must be an object");
      const category = mapLocationCategory(readPath(record, mapping.fields.category), mapping.categoryMap);
      if (category.status === "review") {
        reviewQueue.push({
          recordIndex: index,
          sourceRecordId: referenceText(record, mapping.fields.id),
          name: referenceText(record, mapping.fields.name),
          sourceCategory: category.sourceCategory,
          normalizedSourceCategory: category.normalizedSourceCategory,
          reason: category.reason,
        });
        return;
      }
      locations.push(normalizeRecordWithCategory(record, mapping, category.category));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to normalize raw record ${index}: ${message}`, { cause: error });
    }
  });

  return normalizedLocationOutputSchema.parse({
    schemaVersion: 2,
    source: { name: mapping.source.name },
    locations,
    reviewQueue,
  });
}
