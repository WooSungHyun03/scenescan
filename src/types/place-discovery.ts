import { z } from "zod";

export const KAKAO_CATEGORY_GROUP_CODES = [
  "MT1",
  "CS2",
  "PS3",
  "SC4",
  "AC5",
  "PK6",
  "OL7",
  "SW8",
  "BK9",
  "CT1",
  "AG2",
  "PO3",
  "AT4",
  "AD5",
  "FD6",
  "CE7",
  "HP8",
  "PM9",
] as const;

export const kakaoCategoryGroupCodeSchema = z.enum(KAKAO_CATEGORY_GROUP_CODES);
export const placeSearchSortSchema = z.enum(["accuracy", "distance"]);

const searchCenterSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const paginationSchema = {
  page: z.number().int().min(1).max(45).default(1),
  size: z.number().int().min(1).max(15).default(15),
  sort: placeSearchSortSchema.default("accuracy"),
};

export const keywordPlaceSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  categoryGroupCode: kakaoCategoryGroupCodeSchema.optional(),
  center: searchCenterSchema.optional(),
  radiusMeters: z.number().int().min(0).max(20_000).optional(),
  ...paginationSchema,
}).strict().superRefine((request, context) => {
  if (request.radiusMeters !== undefined && request.center === undefined) {
    context.addIssue({
      code: "custom",
      path: ["center"],
      message: "is required when radiusMeters is provided",
    });
  }
  if (request.sort === "distance" && request.center === undefined) {
    context.addIssue({
      code: "custom",
      path: ["center"],
      message: "is required when sorting by distance",
    });
  }
});

export const categoryPlaceSearchRequestSchema = z.object({
  categoryGroupCode: kakaoCategoryGroupCodeSchema,
  center: searchCenterSchema,
  radiusMeters: z.number().int().min(0).max(20_000),
  ...paginationSchema,
}).strict();

const nullableTrimmedText = z.string().trim().min(1).nullable();
const safeKakaoPlaceUrlSchema = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.hostname !== "place.map.kakao.com"
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || !/^\/\d+\/?$/u.test(url.pathname)
  ) {
    context.addIssue({ code: "custom", message: "must be a canonical Kakao place URL" });
  }
});

export const discoveredPlaceSchema = z.object({
  id: z.string().regex(/^\d+$/u),
  name: z.string().trim().min(1),
  categoryName: nullableTrimmedText,
  categoryGroupCode: kakaoCategoryGroupCodeSchema.nullable(),
  categoryGroupName: nullableTrimmedText,
  phone: nullableTrimmedText,
  address: nullableTrimmedText,
  roadAddress: nullableTrimmedText,
  point: searchCenterSchema,
  placeUrl: safeKakaoPlaceUrlSchema.nullable(),
  distanceMeters: z.number().int().nonnegative().nullable(),
  source: z.literal("Kakao Local"),
}).strict();

export const placeDiscoveryPageSchema = z.object({
  places: z.array(discoveredPlaceSchema).max(15),
  page: z.number().int().min(1).max(45),
  size: z.number().int().min(1).max(15),
  totalCount: z.number().int().nonnegative(),
  pageableCount: z.number().int().nonnegative(),
  isEnd: z.boolean(),
}).strict();

export type KakaoCategoryGroupCode = z.infer<typeof kakaoCategoryGroupCodeSchema>;
export type PlaceSearchSort = z.infer<typeof placeSearchSortSchema>;
export type KeywordPlaceSearchRequest = z.input<typeof keywordPlaceSearchRequestSchema>;
export type CategoryPlaceSearchRequest = z.input<typeof categoryPlaceSearchRequestSchema>;
export type DiscoveredPlace = z.infer<typeof discoveredPlaceSchema>;
export type PlaceDiscoveryPage = z.infer<typeof placeDiscoveryPageSchema>;

export type PlaceDiscoveryRequestOptions = {
  signal?: AbortSignal;
};

export interface PlaceDiscoveryAdapter {
  searchByKeyword(
    request: KeywordPlaceSearchRequest,
    options?: PlaceDiscoveryRequestOptions,
  ): Promise<PlaceDiscoveryPage>;
  searchByCategory(
    request: CategoryPlaceSearchRequest,
    options?: PlaceDiscoveryRequestOptions,
  ): Promise<PlaceDiscoveryPage>;
}
