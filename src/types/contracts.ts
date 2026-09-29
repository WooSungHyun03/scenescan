import { z } from "zod";
import type { Location, LocationFilter, LocationSearchResult } from "./domain";
import { LOCATION_CATEGORY_VALUES, REGION_VALUES } from "./location-options";

export const locationFilterSchema = z.object({
  region: z.enum(REGION_VALUES).optional(),
  category: z.enum(LOCATION_CATEGORY_VALUES).optional(),
});

export const searchRequestSchema = z.object({
  embedding: z.array(z.number().finite()).length(512).refine(
    (embedding) => embedding.some((value) => value !== 0),
    "Embedding must have a non-zero norm",
  ),
  filters: locationFilterSchema.default({}),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export interface SearchResponse {
  results: LocationSearchResult[];
}

export interface LocationListResponse {
  locations: Location[];
  filters: LocationFilter;
}

export interface SimilarLocationsResponse {
  results: LocationSearchResult[];
}
