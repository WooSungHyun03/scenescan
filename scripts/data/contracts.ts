import { z } from "zod";
import type { Location, LocationImage, ParkingInfo } from "../../src/types/domain.ts";
import type { CategoryReviewReason } from "./category-mapping.ts";
import { PERMIT_GUIDANCE_VALUES } from "./permit-information.ts";
import { LOCATION_CATEGORY_VALUES } from "../../src/types/location-options.ts";

// Deliberately NOT src/types/location-options.ts's REGION_VALUES/Region:
// those now fix the *live, served* catalog to "부산" only for the length of
// the Busan-district contract transition (see docs/database.md). This
// discovery/normalization/import pipeline still sources and validates
// candidate locations across all of Korea -- the real
// data/production/locations.json already spans all 17 -- independent of
// which regions the live search API currently serves. Every scripts/data
// file imports this (not the product Region) for exactly that reason.
export const KOREA_REGION_VALUES = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
] as const;
export type KoreaRegion = (typeof KOREA_REGION_VALUES)[number];

const unsafePathSegments = new Set(["__proto__", "prototype", "constructor"]);

const nonEmptyString = z.string().trim().min(1);
const httpUrl = nonEmptyString.url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

const fieldPath = nonEmptyString.refine(
  (value) => value.split(".").every((segment) => segment.length > 0 && !unsafePathSegments.has(segment)),
  "Field path contains an empty or unsafe segment",
);

export type CanonicalLocationImage = Pick<LocationImage, "imageUrl" | "alt"> & {
  imagePath?: string;
};

export type DataProvenance = {
  source: string;
  sourceUrl: string;
  referenceDate: string | null;
  lastVerifiedAt: string | null;
};

export type CanonicalPermitInfo = Pick<
  Location["permit"],
  "type" | "contactName" | "contactPhone" | "note"
> & {
  provenance: DataProvenance;
};

export type CanonicalParkingRecord = {
  id?: ParkingInfo["id"];
  relationship: ParkingInfo["relationship"];
  name: ParkingInfo["name"];
  latitude: ParkingInfo["point"]["latitude"];
  longitude: ParkingInfo["point"]["longitude"];
  capacity: ParkingInfo["capacity"];
  openingHours: ParkingInfo["openingHours"];
  priceInfo: ParkingInfo["priceInfo"];
  provenance: DataProvenance;
};

export type CanonicalLocationRecord = {
  id?: Location["id"];
  name: Location["name"];
  description: Location["description"];
  category: Location["category"];
  region: KoreaRegion;
  address: Location["address"];
  latitude: Location["point"]["latitude"];
  longitude: Location["point"]["longitude"];
  permit: CanonicalPermitInfo;
  parking: CanonicalParkingRecord[];
  images: CanonicalLocationImage[];
  sourceUrl: NonNullable<Location["sourceUrl"]>;
  provenance: DataProvenance;
};

export type CategoryReviewItem = {
  recordIndex: number;
  sourceRecordId: string | null;
  name: string | null;
  sourceCategory: string | null;
  normalizedSourceCategory: string | null;
  reason: CategoryReviewReason;
};

export const dataProvenanceSchema: z.ZodType<DataProvenance> = z.object({
  source: nonEmptyString,
  sourceUrl: httpUrl,
  referenceDate: isoDate.nullable(),
  lastVerifiedAt: isoDateTime.nullable(),
}).strict();

export const canonicalLocationRecordSchema: z.ZodType<CanonicalLocationRecord> = z.object({
  id: nonEmptyString.optional(),
  name: nonEmptyString,
  description: z.string().trim(),
  category: z.enum(LOCATION_CATEGORY_VALUES),
  region: z.enum(KOREA_REGION_VALUES),
  address: nonEmptyString,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  permit: z.object({
    type: z.enum(PERMIT_GUIDANCE_VALUES),
    contactName: nonEmptyString.nullable(),
    contactPhone: nonEmptyString.nullable(),
    note: nonEmptyString.nullable(),
    provenance: dataProvenanceSchema,
  }).strict(),
  parking: z.array(z.object({
    id: nonEmptyString.optional(),
    relationship: z.enum(["on_site", "nearby"]),
    name: nonEmptyString,
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    capacity: z.number().int().nonnegative().nullable(),
    openingHours: nonEmptyString.nullable(),
    priceInfo: nonEmptyString.nullable(),
    provenance: dataProvenanceSchema,
  }).strict()),
  images: z.array(z.object({
    imagePath: nonEmptyString.optional(),
    imageUrl: httpUrl,
    alt: nonEmptyString,
  }).strict()),
  sourceUrl: httpUrl,
  provenance: dataProvenanceSchema,
}).strict();

const provenanceFieldMappingSchema = z.object({
  source: fieldPath.optional(),
  sourceUrl: fieldPath.optional(),
  referenceDate: fieldPath.optional(),
  lastVerifiedAt: fieldPath.optional(),
}).strict();

export const sourceMappingSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    name: nonEmptyString,
    defaultSourceUrl: httpUrl.optional(),
    referenceDate: isoDate.optional(),
    lastVerifiedAt: isoDateTime.optional(),
  }).strict(),
  recordsPath: fieldPath.optional(),
  fields: z.object({
    id: fieldPath.optional(),
    name: fieldPath,
    description: fieldPath.optional(),
    category: fieldPath,
    region: fieldPath,
    address: fieldPath,
    latitude: fieldPath,
    longitude: fieldPath,
    sourceUrl: fieldPath.optional(),
  }).strict(),
  permit: z.object({
    type: fieldPath.optional(),
    contactName: fieldPath.optional(),
    contactPhone: fieldPath.optional(),
    note: fieldPath.optional(),
  }).strict().default({}),
  provenance: z.object({
    location: provenanceFieldMappingSchema.default({}),
    permit: provenanceFieldMappingSchema.default({}),
  }).strict().default({ location: {}, permit: {} }),
  parking: z.object({
    path: fieldPath,
    id: fieldPath.optional(),
    relationship: fieldPath,
    name: fieldPath,
    latitude: fieldPath,
    longitude: fieldPath,
    capacity: fieldPath.optional(),
    openingHours: fieldPath.optional(),
    priceInfo: fieldPath.optional(),
    provenance: provenanceFieldMappingSchema.default({}),
  }).strict().optional(),
  parkingRelationshipMap: z.record(z.string(), z.enum(["on_site", "nearby"])).default({}),
  images: z.object({
    path: fieldPath,
    url: fieldPath.optional(),
    alt: fieldPath.optional(),
    localPath: fieldPath.optional(),
  }).strict().refine(
    (value) => value.url !== undefined || value.alt === undefined,
    { message: "images.alt requires images.url", path: ["alt"] },
  ).optional(),
  categoryMap: z.record(z.string(), z.enum(LOCATION_CATEGORY_VALUES)).default({}),
  regionMap: z.record(z.string(), z.enum(KOREA_REGION_VALUES)).default({}),
  permitTypeMap: z.record(z.string(), z.enum(PERMIT_GUIDANCE_VALUES)).default({}),
  defaults: z.object({
    description: z.string().trim().default(""),
    permitType: z.enum(PERMIT_GUIDANCE_VALUES).default("문의 필요"),
  }).strict().default({ description: "", permitType: "문의 필요" }),
}).strict();

export type SourceMapping = z.infer<typeof sourceMappingSchema>;

export const normalizedLocationOutputSchema = z.object({
  schemaVersion: z.literal(2),
  source: z.object({
    name: nonEmptyString,
  }).strict(),
  locations: z.array(canonicalLocationRecordSchema),
  reviewQueue: z.array(z.object({
    recordIndex: z.number().int().nonnegative(),
    sourceRecordId: nonEmptyString.nullable(),
    name: nonEmptyString.nullable(),
    sourceCategory: nonEmptyString.nullable(),
    normalizedSourceCategory: nonEmptyString.nullable(),
    reason: z.enum(["MISSING_CATEGORY", "INVALID_CATEGORY", "UNKNOWN_CATEGORY"]),
  }).strict()).default([]),
}).strict().refine(
  (value) => value.locations.length + value.reviewQueue.length > 0,
  { message: "Normalized output must contain at least one location or category review item" },
);

export type NormalizedLocationOutput = z.infer<typeof normalizedLocationOutputSchema>;

export function parseSourceMapping(value: unknown): SourceMapping {
  return sourceMappingSchema.parse(value);
}

export function parseNormalizedLocationOutput(value: unknown): NormalizedLocationOutput {
  return normalizedLocationOutputSchema.parse(value);
}
