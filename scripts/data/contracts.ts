import { z } from "zod";
import type { Location, LocationImage } from "../../src/types/domain.ts";

const locationCategories = ["urban", "nature", "industrial", "interior"] as const;
const regions = ["서울", "부산", "인천", "경기"] as const;
const unsafePathSegments = new Set(["__proto__", "prototype", "constructor"]);

const nonEmptyString = z.string().trim().min(1);
const httpUrl = nonEmptyString.url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);

const fieldPath = nonEmptyString.refine(
  (value) => value.split(".").every((segment) => segment.length > 0 && !unsafePathSegments.has(segment)),
  "Field path contains an empty or unsafe segment",
);

export type CanonicalLocationRecord = {
  name: Location["name"];
  description: Location["description"];
  category: Location["category"];
  region: Location["region"];
  address: Location["address"];
  latitude: Location["point"]["latitude"];
  longitude: Location["point"]["longitude"];
  permit: Location["permit"];
  images: Array<Pick<LocationImage, "imageUrl" | "alt">>;
  sourceUrl: NonNullable<Location["sourceUrl"]>;
};

export const canonicalLocationRecordSchema: z.ZodType<CanonicalLocationRecord> = z.object({
  name: nonEmptyString,
  description: z.string().trim(),
  category: z.enum(locationCategories),
  region: z.enum(regions),
  address: nonEmptyString,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  permit: z.object({
    type: nonEmptyString,
    contactName: nonEmptyString.nullable(),
    contactPhone: nonEmptyString.nullable(),
    note: nonEmptyString.nullable(),
  }).strict(),
  images: z.array(z.object({
    imageUrl: httpUrl,
    alt: nonEmptyString,
  }).strict()),
  sourceUrl: httpUrl,
}).strict();

export const sourceMappingSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    name: nonEmptyString,
    defaultSourceUrl: httpUrl.optional(),
  }).strict(),
  recordsPath: fieldPath.optional(),
  fields: z.object({
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
  images: z.object({
    path: fieldPath,
    url: fieldPath.optional(),
    alt: fieldPath.optional(),
  }).strict().refine(
    (value) => value.url !== undefined || value.alt === undefined,
    { message: "images.alt requires images.url", path: ["alt"] },
  ).optional(),
  categoryMap: z.record(z.string(), z.enum(locationCategories)).default({}),
  regionMap: z.record(z.string(), z.enum(regions)).default({}),
  defaults: z.object({
    description: z.string().trim().default(""),
    permitType: nonEmptyString.default("정보 확인 필요"),
  }).strict().default({ description: "", permitType: "정보 확인 필요" }),
}).strict();

export type SourceMapping = z.infer<typeof sourceMappingSchema>;

export const normalizedLocationOutputSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    name: nonEmptyString,
  }).strict(),
  locations: z.array(canonicalLocationRecordSchema).min(1),
}).strict();

export type NormalizedLocationOutput = z.infer<typeof normalizedLocationOutputSchema>;

export function parseSourceMapping(value: unknown): SourceMapping {
  return sourceMappingSchema.parse(value);
}

export function parseNormalizedLocationOutput(value: unknown): NormalizedLocationOutput {
  return normalizedLocationOutputSchema.parse(value);
}
