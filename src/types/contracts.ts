import { z } from "zod";
import type { Location, LocationFilter, LocationSearchResult } from "./domain";

export const locationFilterSchema = z.object({
  region: z.enum(["서울", "부산", "인천", "경기"]).optional(),
  category: z.enum(["urban", "nature", "industrial", "interior"]).optional(),
});

export const searchRequestSchema = z.object({
  embedding: z.array(z.number().finite()).length(512),
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
